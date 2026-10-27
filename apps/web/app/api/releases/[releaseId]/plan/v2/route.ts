import { NextRequest, NextResponse } from 'next/server';

import {
  createAdminClient,
  isReleasePlannerEnabled,
  loadOwnedRelease,
  loadPlannerTeam,
  requireActiveAuthenticatedUser,
  todayYmd,
} from '../_shared';
import { isPlannerV2Enabled, parsePlannerV2Answers } from '@/lib/planner-v2/answers';
import { coercePlanV2 } from '@/lib/planner-v2/plan';
import { MAX_TWEAK_LENGTH, type PlanV2Mode } from '@/lib/planner-v2/prompt';
import { applyPlanV2, previewPlanV2 } from '@/lib/planner-v2/server';
import type { PlanV2Source } from '@/lib/planner-v2/write-plan';
import { finishPlannerAuto, isAutoBuildInFlight } from '@/lib/planner-auto-server';
import { canRunEmbeddedAction, isUrgansActionsEnabled } from '@/lib/urgans-actions/server';
import { minimumTierWith } from '@/lib/entitlements';
import { PRICING_TIERS } from '@urganize/pricing';
import { IDEA_ROUND_COPY } from '@/lib/idea-round';
import { planInputFor } from '@/lib/idea-round-server';

/**
 * Plan with UrgAns v2 (2026-10-26, founder approved): UrgAns writes the whole
 * plan from five short answers, code checks it, the manager previews it.
 *
 *   POST { action: 'preview', answers, mode?: 'generate' | 'reroll' | 'tweak',
 *          previous?, request? }
 *     → 200 { plan, source, notice, fallbackReason, releaseDate }. Writes no
 *       rows (credits aside: a model call is charged like any plan, the
 *       team's first plan free).
 *   POST { action: 'apply', answers, plan, source }
 *     → 201 { tasksCreated, releaseDate }. Re-checks the plan, then saves it
 *       through the existing plan document and activity insert. No model call.
 *
 * Owner-only through loadOwnedRelease, like the v1 planner. 404 when the flag
 * NEXT_PUBLIC_FEATURE_PLANNER_V2 is 'false'.
 */
export const maxDuration = 60;

const SOURCES: PlanV2Source[] = ['ai', 'ai_repaired', 'fallback'];

export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  const startedAt = Date.now();
  if (!isReleasePlannerEnabled() || !isPlannerV2Enabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'A JSON body is required.' }, { status: 400 });

  const parsed = parsePlannerV2Answers(body.answers);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  let answers = parsed.answers;

  const action = body.action === 'apply' ? 'apply' : body.action === 'preview' ? 'preview' : null;
  if (!action) return NextResponse.json({ error: 'action must be preview or apply.' }, { status: 400 });

  let mode: PlanV2Mode = { kind: 'generate' };
  let plan = null as ReturnType<typeof coercePlanV2>;
  if (action === 'preview' && (body.mode === 'reroll' || body.mode === 'tweak')) {
    const previous = coercePlanV2(body.previous);
    if (!previous) return NextResponse.json({ error: 'previous plan is required.' }, { status: 400 });
    if (body.mode === 'tweak') {
      const ask = typeof body.request === 'string' ? body.request.trim().slice(0, MAX_TWEAK_LENGTH) : '';
      if (!ask) return NextResponse.json({ error: 'Say what to change.' }, { status: 400 });
      mode = { kind: 'tweak', previous, request: ask };
    } else {
      mode = { kind: 'reroll', previous };
    }
  }
  if (action === 'apply') {
    plan = coercePlanV2(body.plan);
    if (!plan) return NextResponse.json({ error: 'plan is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;
  const release = loaded.release;

  // The same entitlement gate the v1 planner reaches through the embedded
  // action (a Solo team is refused with the locked sheet, not a quiet plan).
  if (isUrgansActionsEnabled() && !(await canRunEmbeddedAction(adminClient, 'release.draft_plan', releaseId, auth.user))) {
    const minimumPlan = minimumTierWith('urgans_embedded_actions');
    const planLabel = minimumPlan ? PRICING_TIERS[minimumPlan].label : 'a higher plan';
    return NextResponse.json(
      { error: `UrgAns can plan this rollout for you on ${planLabel}.`, code: 'plan_required' },
      { status: 403 }
    );
  }

  // Idea round (2026-10-27): a rollout with ideas is planned only from its
  // approved brief, which replaces whatever notes the browser sent. The raw
  // ideas never reach the planner. A rollout with no ideas plans as before.
  const planInput = await planInputFor(adminClient, releaseId);
  if (planInput.gate === 'needs_approval') {
    return NextResponse.json({ error: IDEA_ROUND_COPY.notApproved, code: 'brief_not_approved' }, { status: 409 });
  }
  if (planInput.gate === 'from_brief') answers = { ...answers, notes: planInput.notes };

  if (isAutoBuildInFlight(release.metadata)) {
    return NextResponse.json({ error: 'This plan is already being created.', code: 'plan_in_progress' }, { status: 409 });
  }

  if (action === 'preview') {
    const result = await previewPlanV2(adminClient, {
      release,
      actor: auth.user,
      answers,
      mode,
      todayYmd: todayYmd(),
      startedAt,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status });
    }
    const { written, releaseDate } = result;
    return NextResponse.json({
      plan: written.plan,
      source: written.source,
      notice: written.notice,
      fallbackReason: written.fallbackReason,
      releaseDate,
    });
  }

  const source = SOURCES.includes(body.source as PlanV2Source) ? (body.source as PlanV2Source) : 'fallback';
  const result = await applyPlanV2(adminClient, {
    release,
    actor: auth.user,
    answers,
    plan: plan!,
    source,
    todayYmd: todayYmd(),
    loadTeam: () => loadPlannerTeam(adminClient, releaseId, auth.user),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.status });
  }
  await finishPlannerAuto(adminClient, releaseId, { state: 'done' });
  return NextResponse.json({ tasksCreated: result.tasksCreated, releaseDate: result.releaseDate }, { status: 201 });
}
