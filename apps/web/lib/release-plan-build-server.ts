import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlannerOnboardingContext, ReleasePlanIntake } from './release-planning';
import {
  PLANNER_DEADLINE_MS,
  createReleasePlan,
  getPlannerTemplate,
  type CreateReleasePlanResult,
  type PlannerReleaseRow,
} from './release-planning-actions-server';
import { resolvePlannerModel, resolvePlannerReasoningEffort } from './ai/planner-model';
import { loadTeamForRouting } from './ai/routing-team-server';
import { recordRequestUsage } from './ai/usage-log-server';
import { getTeamAccessForUser } from './team-billing-server';
import { beginEmbeddedRun, settleEmbeddedRun, type EmbeddedRunGate } from './credits/embedded-server';
import { isFirstPlanFreeForTeam } from './credits/first-plan-server';
import { isCreditsEnabled } from './credits/config';
import { createUsageCollector } from './credits/embedded';
import type { WorkspaceMember } from '@/types/auth';

/**
 * Build a rollout's plan: the ONE implementation behind POST
 * /api/releases/[id]/plan and the auto build at the end of onboarding
 * (2026-10-17). Moved out of the route unchanged: credits held before and
 * settled after (a team's first plan is free and never refused over a model
 * failure), the usage log, and createReleasePlan in the middle.
 *
 * Auth and ownership are the caller's job; `release` must already be the
 * actor's own.
 */
export type BuildRolloutPlanResult =
  | CreateReleasePlanResult
  | { ok: false; status: 429; error: string; code: 'out_of_credits' };

export async function buildRolloutPlan(
  admin: SupabaseClient,
  params: {
    release: PlannerReleaseRow;
    actor: { id: string; email?: string | null };
    intake: ReleasePlanIntake;
    todayYmd: string;
    /** When the request (or the auto build's own invocation) started; the
     *  model's deadline is PLANNER_DEADLINE_MS after it. */
    startedAt: number;
    loadTeam: () => Promise<{ ok: true; workspaceId: string; members: WorkspaceMember[] } | { ok: false }>;
    /** Signup answers for the prompt. Absent = read from the actor's profile. */
    onboarding?: PlannerOnboardingContext | null;
  }
): Promise<BuildRolloutPlanResult> {
  const { release, actor, intake, todayYmd, startedAt, loadTeam, onboarding } = params;
  const releaseId = release.id;

  const { template, fallbackToSingle } = getPlannerTemplate(intake.release_type);

  // Credits, when switched on. This is the door the chat assistant and the
  // ungated fallback both use to build a plan, and the plan's model call is the
  // expensive one, so it is metered here exactly as release.draft_plan is (hold
  // before, real cost after, never above the hold; credits/embedded.ts). 429
  // and not 402, which the browser turns into a redirect to the paywall.
  const ownerTeam = await getTeamAccessForUser(actor.id, actor.email);
  // A team's first plan is free (credits/first-plan.ts). Read whether credits
  // are on or not: a first plan is also never refused over a model failure.
  const firstPlan = await isFirstPlanFreeForTeam(admin, 'release.draft_plan', ownerTeam.ownerUserId);
  const firstPlanFree = isCreditsEnabled() && firstPlan;
  const gate: EmbeddedRunGate = firstPlanFree
    ? { metered: false }
    : await beginEmbeddedRun(admin, {
        workspaceId: ownerTeam.primaryWorkspaceId,
        ownerUserId: ownerTeam.ownerUserId,
        team: ownerTeam,
      });
  if (gate.metered && !gate.ok) {
    return { ok: false, status: 429, error: gate.message, code: 'out_of_credits' };
  }
  const collector = createUsageCollector(resolvePlannerModel() ?? null);
  // One id for the run: the ledger's charge and the usage log's rows both carry it.
  const runRequestId = `embedded:${randomUUID()}`;
  const logUsage = (creditsCharged: number) =>
    recordRequestUsage(admin, {
      context: {
        requestId: runRequestId,
        feature: 'plan',
        workspaceId: ownerTeam.primaryWorkspaceId,
        ownerUserId: ownerTeam.ownerUserId,
        actorUserId: actor.id,
        releaseId,
      },
      calls: collector.calls,
      failures: collector.failures,
      creditsCharged,
    });

  const result = await createReleasePlan(admin, {
    release,
    actor,
    intake,
    todayYmd,
    template,
    fallbackToSingle,
    loadTeam,
    // Undefined unless the model router is on (or in shadow): the plan ceiling is
    // the only thing it is for, and the model itself is chosen inside.
    routingTeam: await loadTeamForRouting('planner', actor),
    reasoningEffort: resolvePlannerReasoningEffort(),
    deadlineMs: startedAt + PLANNER_DEADLINE_MS,
    onUsage: collector.onUsage,
    onFailure: collector.onFailure,
    firstPlan,
    ...(onboarding !== undefined ? { onboarding } : {}),
  });

  if (!result.ok) {
    // Not charged, but the calls it made before it failed were billed to us.
    await logUsage(0);
    return result;
  }

  // Charged only now: a plan that could not be built costs nothing.
  const charge = await settleEmbeddedRun(admin, {
    gate,
    workspaceId: ownerTeam.primaryWorkspaceId,
    ownerUserId: ownerTeam.ownerUserId,
    actorUserId: actor.id,
    requestId: runRequestId,
    actionId: 'release.draft_plan',
    calls: collector.calls,
  });
  await logUsage(gate.metered && gate.ok ? charge.credits : 0);

  return result;
}
