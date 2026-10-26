import { NextRequest, NextResponse } from 'next/server';
import { canRunEmbeddedAction, isUrgansActionsEnabled } from '@/lib/urgans-actions/server';
import { minimumTierWith } from '@/lib/entitlements';
import { PRICING_TIERS } from '@urganize/pricing';
import { MAX_IDEA_LENGTH } from '@/lib/rollout-ideas';
import { readApplyBody } from '@/lib/rollout-idea-changes';
import { applyIdeaChanges, suggestIdeaChanges } from '@/lib/rollout-idea-changes-server';
import { isReleasePlannerEnabled, loadOwnedRelease, todayYmd } from '../../plan/_shared';
import {
  createAdminClient,
  ensureReleaseTeamWriteAccess,
  ideasEnabled,
  notFoundResponse,
  requireActiveAuthenticatedUser,
} from '../_shared';

/**
 * New ideas that update a plan that already exists (2026-10-26, founder
 * approved). The owner adds an idea; UrgAns suggests tasks to add and open
 * tasks to move; nothing is saved until the owner applies it.
 *
 *   POST { action: 'suggest', idea } → 200 { changes, view }. Writes nothing.
 *   POST { action: 'apply', adds, moves } → 200 { added, moved }. Re-checks
 *     what was sent against the board as it is now; no model call.
 *
 * Owner-only (loadOwnedRelease: 404 for anyone else), like building the plan.
 * Suggesting needs the same plan as UrgAns's other embedded actions.
 */

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const startedAt = Date.now();
  if (!ideasEnabled() || !isReleasePlannerEnabled()) return notFoundResponse();

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action === 'apply' ? 'apply' : body?.action === 'suggest' ? 'suggest' : null;
  if (!body || !action) return NextResponse.json({ error: 'action must be suggest or apply.' }, { status: 400 });

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });

  // Team access first (the shared check every ideas route makes), then the owner:
  // only the owner changes the plan.
  const access = await ensureReleaseTeamWriteAccess(adminClient, releaseId, auth.user);
  if ('error' in access) return access.error;

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;
  const release = loaded.release;

  if (action === 'suggest') {
    const idea = typeof body.idea === 'string' ? body.idea.trim().slice(0, MAX_IDEA_LENGTH) : '';
    if (!idea) return NextResponse.json({ error: 'Say the idea first.' }, { status: 400 });

    if (isUrgansActionsEnabled() && !(await canRunEmbeddedAction(adminClient, 'release.draft_plan', releaseId, auth.user))) {
      const minimumPlan = minimumTierWith('urgans_embedded_actions');
      const planLabel = minimumPlan ? PRICING_TIERS[minimumPlan].label : 'a higher plan';
      return NextResponse.json(
        { error: `UrgAns can update this plan for you on ${planLabel}.`, code: 'plan_required' },
        { status: 403 }
      );
    }

    const result = await suggestIdeaChanges(adminClient, {
      release,
      ownerUserId: auth.user.id,
      idea,
      todayYmd: todayYmd(),
      startedAt,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ changes: result.changes, view: result.view });
  }

  const { adds, moves } = readApplyBody(body);
  const result = await applyIdeaChanges(adminClient, {
    release,
    ownerUserId: auth.user.id,
    adds,
    moves,
    todayYmd: todayYmd(),
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ added: result.added, moved: result.moved });
}
