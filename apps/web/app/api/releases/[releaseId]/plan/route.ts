import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  createAdminClient,
  getPlannerTemplate,
  isReleasePlannerEnabled,
  loadCreatedPlan,
  loadOwnedRelease,
  loadPlannerTeam,
  requireActiveAuthenticatedUser,
  toPlanResponse,
  todayYmd,
} from './_shared';
import { parseReleasePlanIntake } from '@/lib/release-planning';
import { PLANNER_DEADLINE_MS, createReleasePlan } from '@/lib/release-planning-actions-server';
import { resolvePlannerReasoningEffort } from '@/lib/ai/planner-model';
import { loadTeamForRouting } from '@/lib/ai/routing-team-server';
import { resolvePlannerModel } from '@/lib/ai/planner-model';
import { getTeamAccessForUser } from '@/lib/team-billing-server';
import { beginEmbeddedRun, settleEmbeddedRun, type EmbeddedRunGate } from '@/lib/credits/embedded-server';
import { isFirstPlanFreeForTeam } from '@/lib/credits/first-plan-server';
import { isCreditsEnabled } from '@/lib/credits/config';
import { createUsageCollector } from '@/lib/credits/embedded';
import { recordRequestUsage } from '@/lib/ai/usage-log-server';

/**
 * The rollout plan: build it (POST) or read back what was built (GET).
 *
 * Until 2026-09-15 this group also held a draft to autosave (PUT), discard
 * (DELETE) and approve, plus a per-phase redraft. The review step is gone: the
 * answers to the planning questions are the decision, and the plan lands as
 * activities the manager edits like any other. See createReleasePlan's own
 * header for the order of operations and why it is the design.
 */

// The model call's budget is sized against this ceiling — Vercel's Hobby-plan
// maximum, which code cannot raise. createReleasePlan hands the provider a
// deadline PLANNER_DEADLINE_MS (52s) after the route starts, so the last
// attempt aborts with time left to write the activities and answer. Auth and
// the DB pre-work take a second or two; the three budget constants live
// beside createReleasePlan and moving one means re-checking this arithmetic.
export const maxDuration = 60;

/**
 * GET — the plan that was built for this rollout, plus the saved answers.
 *
 * `plan` is null until a plan has been built. The answers come back
 * separately so the questions can be prefilled from a previous run — a build
 * that was refused because UrgAns could not read the notes leaves the answers
 * saved and nothing built, and the manager comes back to them filled in.
 * Answers stored by the superseded tailor-plan feature are a different shape
 * and simply parse to null.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  if (!isReleasePlannerEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;

  const planResult = await loadCreatedPlan(adminClient, releaseId);
  if ('error' in planResult) return planResult.error;

  const savedIntake = parseReleasePlanIntake(loaded.release.release_context);

  return NextResponse.json({
    plan: planResult.plan ? toPlanResponse(planResult.plan) : null,
    intake: savedIntake.ok ? savedIntake.intake : null,
    releaseDate: loaded.release.release_date,
  });
}

/**
 * POST — build the plan from the intake answers, straight into activities.
 *
 * A thin HTTP wrapper: auth, params and body validation stay here (the
 * 400-before-500 precedence), everything from "does this rollout already have
 * a plan" onward is lib/release-planning-actions-server.ts's
 * createReleasePlan, the one implementation the release.draft_plan embedded
 * action also calls. Owner-only through loadOwnedRelease, matching the
 * planning card's own gate.
 *
 * Answers: 201 with the plan summary; 400 for a bad body or a rollout with no
 * date; 409 `tasks_exist` when a plan already exists and `plan_in_progress`
 * when another call is building one; 503 `tailoring_unavailable` when the
 * manager typed notes and the model could not read them (nothing is created,
 * the answers are saved).
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ releaseId: string }> }
) {
  const startedAt = Date.now();

  if (!isReleasePlannerEnabled()) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const auth = await requireActiveAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const { releaseId } = await context.params;
  if (!releaseId) {
    return NextResponse.json({ error: 'Rollout id is required.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { intake?: unknown } | null;
  if (!body) {
    return NextResponse.json({ error: 'A JSON body with intake answers is required.' }, { status: 400 });
  }

  const intakeResult = parseReleasePlanIntake(body.intake);
  if (!intakeResult.ok) {
    return NextResponse.json({ error: intakeResult.error }, { status: 400 });
  }
  const intake = intakeResult.intake;

  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  const loaded = await loadOwnedRelease(adminClient, releaseId, auth.user.id);
  if ('error' in loaded) return loaded.error;
  const release = loaded.release;

  const { template, fallbackToSingle } = getPlannerTemplate(intake.release_type);

  // Credits, when switched on. THIS ROUTE IS THE DOOR the chat assistant and the
  // ungated fallback both use to build a plan, and the plan's model call is the
  // expensive one, so it is metered here exactly as release.draft_plan is (hold
  // before, real cost after, never above the hold; credits/embedded.ts). Without
  // this a plan asked for in chat would be free. 429 and not 402, which the
  // browser turns into a redirect to the paywall.
  const ownerTeam = await getTeamAccessForUser(auth.user.id, auth.user.email);
  // A team's first plan is free (credits/first-plan.ts), through this door too,
  // or the chat path would charge for what the planner gives away.
  const firstPlanFree =
    isCreditsEnabled() &&
    (await isFirstPlanFreeForTeam(adminClient, 'release.draft_plan', ownerTeam.ownerUserId));
  const gate: EmbeddedRunGate = firstPlanFree
    ? { metered: false }
    : await beginEmbeddedRun(adminClient, {
        workspaceId: ownerTeam.primaryWorkspaceId,
        ownerUserId: ownerTeam.ownerUserId,
        team: ownerTeam,
      });
  if (gate.metered && !gate.ok) {
    return NextResponse.json({ error: gate.message, code: 'out_of_credits' }, { status: 429 });
  }
  const collector = createUsageCollector(resolvePlannerModel() ?? null);
  // One id for the run: the ledger's charge and the usage log's rows both carry it.
  const runRequestId = `embedded:${randomUUID()}`;
  const logUsage = (creditsCharged: number) =>
    recordRequestUsage(adminClient, {
      context: {
        requestId: runRequestId,
        feature: 'plan',
        workspaceId: ownerTeam.primaryWorkspaceId,
        ownerUserId: ownerTeam.ownerUserId,
        actorUserId: auth.user.id,
        releaseId,
      },
      calls: collector.calls,
      failures: collector.failures,
      creditsCharged,
    });

  const result = await createReleasePlan(adminClient, {
    release,
    actor: auth.user,
    intake,
    todayYmd: todayYmd(),
    template,
    fallbackToSingle,
    loadTeam: () => loadPlannerTeam(adminClient, releaseId, auth.user),
    // Undefined unless the model router is on (or in shadow): the plan ceiling is
    // the only thing it is for, and the model itself is chosen inside.
    routingTeam: await loadTeamForRouting('planner', auth.user),
    reasoningEffort: resolvePlannerReasoningEffort(),
    deadlineMs: startedAt + PLANNER_DEADLINE_MS,
    onUsage: collector.onUsage,
    onFailure: collector.onFailure,
  });

  if (!result.ok) {
    // Not charged, but the calls it made before it failed were billed to us.
    await logUsage(0);
    return NextResponse.json(
      { error: result.error, ...(result.code ? { code: result.code } : {}) },
      { status: result.status }
    );
  }

  // Charged only now: a plan that could not be built costs nothing.
  const charge = await settleEmbeddedRun(adminClient, {
    gate,
    workspaceId: ownerTeam.primaryWorkspaceId,
    ownerUserId: ownerTeam.ownerUserId,
    actorUserId: auth.user.id,
    requestId: runRequestId,
    actionId: 'release.draft_plan',
    calls: collector.calls,
  });
  await logUsage(gate.metered && gate.ok ? charge.credits : 0);

  return NextResponse.json({ plan: result.plan }, { status: 201 });
}
