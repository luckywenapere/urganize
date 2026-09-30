// The FIRST embedded UrgAns action: build a release's rollout plan (spec 6.1,
// "Draft the plan"). Wraps createReleasePlan (lib/release-planning-actions-
// server.ts) — the SAME pipeline the workspace card's POST /plan call and the
// chat interview's generate_release_plan tool both use — gated, logged, and
// reached from inside the release rather than from a separate surface.
//
// SINCE 2026-09-15 THIS ACTION IS ONE-SHOT. There used to be a Draft step here
// (this file's own generatePlanDraft call) followed by a Review scene and a
// separate Apply; that whole shape is gone, along with the review scene
// itself. Finishing the intake now builds the plan straight into the
// rollout's activities in one call, exactly like the chat door and the
// workspace card. So `oneShot: true` (see ../types.ts) and there is no
// apply()/discard() left to define — the run's own execute() already did the
// whole job, and runUrgansAction logs it as already 'applied'.
//
// ONE ENTRY POINT NOW, NOT TWO. The one-tap "derive everything from the
// release row" path (buildAutoIntake) is gone with the review it used to
// stage: every caller must already have the seven answers, collected by the
// intake modal or the chat interview, exactly as the workspace card's own
// POST /plan route requires. input.intake is therefore REQUIRED, not
// optional — see execute()'s first check.
//
// EVERY WRITE IS SCOPED TO THE RELEASE OWNER, never the acting teammate —
// createReleasePlan's own writes (release_plan_drafts, tasks) are already
// keyed on the release's owner, matching the "child rows are stamped with the
// release owner, never the acting teammate" rule every other team-aware scene
// follows. Team RESOLUTION (who may be assigned) is different: that is
// genuinely release-scoped rather than storage-scoped, so it uses the real
// caller.
//
// ACCESS IS 'owner_write', NOT 'team_write' — even though the release itself
// is visible to the whole team. createReleasePlan's own route
// (app/api/releases/[releaseId]/plan/route.ts) is still owner-keyed via
// loadOwnedRelease, a deliberate, RECORDED deferral (see
// lib/release-access-guard.test.ts's own header: "plan is deferred"). A
// team-write teammate could tap this action, clear the entitlement gate, and
// then have their build 404 against the same still-owner-only route the
// workspace card uses. See ../types.ts's UrgansActionAccessLevel comment for
// the full reasoning and what a non-owner team member sees instead — the same
// 404 a stranger would, never a 403 that would confirm ownership.

import {
  createReleasePlan,
  getPlannerTemplate,
  PLANNER_DEADLINE_MS,
  type PlannerReleaseRow,
} from '../../release-planning-actions-server';
import { parseReleasePlanIntake, type CreatedPlan } from '../../release-planning';
import { resolvePlannerModel, resolvePlannerReasoningEffort } from '../../ai/planner-model';
import { loadTeamForRouting } from '../../ai/routing-team-server';
import { summarizeTrace, type RoutingTrace } from '../../ai/model-router';
import { resolveReleaseTaskWorkspace } from '../../tasks-server';
import type { AiUsage } from '../../ai/provider';
import type { WorkspaceMember } from '@/types/auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UrgansActionDefinition } from '../types';

export type ReleaseDraftPlanInput = {
  /** The seven-question answers, already collected by the intake modal or
   *  the chat interview and shaped into a ReleasePlanIntake — parsed and
   *  validated again here, never trusted from the caller. Required: since
   *  this action stopped having a one-tap path, there is nothing left to
   *  auto-derive from the release row alone. */
  intake: unknown;
};

/** Since execute() now does the whole job in one call, its output IS the
 *  final result — the same CreatedPlan shape createReleasePlan itself
 *  returns, and the same one the chat tool and the workspace card both read.
 *  There is no separate apply() step left to transform it. */
export type ReleaseDraftPlanOutput = CreatedPlan;

/**
 * A small, deliberate duplicate of the same select as the plan route group's
 * loadOwnedRelease (app/api/releases/[releaseId]/plan/_shared.ts) — see that
 * file's own header, and release-planning-actions-server.ts's, for why these
 * small private duplicates are preferred here over a lib module reaching into
 * an app/api route group's helpers. This one skips the owner-only check
 * entirely: by the time execute() runs, resolveActionScope has already
 * decided whether this caller may act on this release.
 */
async function loadReleaseRow(
  admin: SupabaseClient,
  releaseId: string
): Promise<PlannerReleaseRow | null> {
  const { data, error } = await admin
    .from('releases')
    .select('id,owner_user_id,title,artist_name,release_date,release_type,release_context,metadata')
    .eq('id', releaseId)
    .maybeSingle();
  if (error || !data) return null;
  return data as PlannerReleaseRow;
}

/** The team a release's tasks may be assigned to, tolerating failure exactly
 *  as the plan route group's loadPlannerTeam does — createReleasePlan and the
 *  owner-history heuristic both degrade gracefully to "everything stays with
 *  the owner" rather than failing the whole run. */
async function loadTeamForRelease(
  admin: SupabaseClient,
  releaseId: string,
  actor: { id: string; email?: string | null }
): Promise<{ ok: true; workspaceId: string; members: WorkspaceMember[] } | { ok: false }> {
  try {
    const resolved = await resolveReleaseTaskWorkspace(admin, releaseId, {
      id: actor.id,
      email: actor.email || '',
    } as Parameters<typeof resolveReleaseTaskWorkspace>[2]);
    return { ok: true, workspaceId: resolved.workspaceId, members: resolved.members };
  } catch (error) {
    console.error('[urgans-actions] could not resolve the team for rollout', releaseId, error);
    return { ok: false };
  }
}

const todayYmd = (): string => new Date().toISOString().slice(0, 10);

export const releaseDraftPlanAction: UrgansActionDefinition<
  ReleaseDraftPlanInput,
  ReleaseDraftPlanOutput
> = {
  id: 'release.draft_plan',
  label: 'Build the rollout plan',
  objectTypes: ['release'],
  access: 'owner_write',
  promptVersion: 'release.draft_plan.v2',
  oneShot: true,

  async execute({ admin, objectId, actor, ownerUserId, input }) {
    const release = await loadReleaseRow(admin, objectId);
    if (!release) return { ok: false, status: 404, error: 'Rollout not found.' };

    if (input?.intake === undefined) {
      return { ok: false, status: 400, error: 'Answer the planning questions first.' };
    }
    const parsed = parseReleasePlanIntake(input.intake);
    if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
    const intake = parsed.intake;

    const { template, fallbackToSingle } = getPlannerTemplate(intake.release_type);

    let usage: AiUsage | null = null;
    let routed: RoutingTrace | null = null;

    const result = await createReleasePlan(admin, {
      release,
      actor: { id: ownerUserId, email: actor.email },
      intake,
      todayYmd: todayYmd(),
      template,
      fallbackToSingle,
      loadTeam: () => loadTeamForRelease(admin, objectId, actor),
      // The RELEASE OWNER's team decides the ceiling, not the acting teammate's
      // (the same rule as the tier gate). No email: the owner's is not known
      // here, and the only thing an email does is the staff allowlist, which
      // must not be granted to the owner on the actor's say-so.
      routingTeam: await loadTeamForRouting('planner', { id: ownerUserId, email: null }),
      reasoningEffort: resolvePlannerReasoningEffort(),
      deadlineMs: Date.now() + PLANNER_DEADLINE_MS,
      onUsage: (reported) => {
        usage = reported;
      },
      onTrace: (trace) => {
        routed = trace;
      },
    });

    if (!result.ok) {
      return { ok: false, status: result.status, error: result.error };
    }

    const trace = routed as RoutingTrace | null;
    return {
      ok: true,
      output: result.plan,
      // A short, loggable summary — never the full plan document, which the
      // caller already has as `output` on this same row. When the model router
      // acted, what it did rides along (bounded, and absent otherwise).
      inputSummary: {
        releaseType: intake.release_type,
        exclusionsCount: intake.exclusions?.length ?? 0,
        ...(trace ? { routing: summarizeTrace(trace) } : {}),
      },
      // The model that ANSWERED: the last one the router called, or, with the
      // router off, the one the planner has always used.
      model: trace?.models[trace.models.length - 1] ?? resolvePlannerModel() ?? null,
      tokensIn: usage ? (usage as AiUsage).promptTokens : null,
      tokensOut: usage ? (usage as AiUsage).completionTokens : null,
    };
  },

  // No apply(), no discard(): oneShot means execute() already did the whole
  // job. runUrgansAction logs the row as already 'applied' with `output`
  // mirrored into `applied_result`, so there is nothing left for either to do.
};
