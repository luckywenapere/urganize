// The FIRST embedded UrgAns action: draft a release's rollout plan (spec
// 6.1, "Draft the plan"). Wraps the existing UrgAns planner
// (lib/release-planning-actions-server.ts) — the same generate/approve/
// discard machinery the legacy /plan/{generate,approve} routes and PUT/DELETE
// plan/route.ts already call, gated, logged, and given one tap in instead of
// a seven-question modal.
//
// TWO ENTRY POINTS SHARE ONE execute(): the one-tap "Draft the plan" button
// (no input) derives an intake from the release row alone (buildAutoIntake);
// the "Tell UrgAns more" refine path (the existing seven-question modal)
// posts real answers as `input.intake`. Both reach the SAME entitlement gate
// in ../server.ts's runUrgansAction — a refine-mode submission must not be a
// way around it.
//
// apply() IGNORES its own `output` parameter entirely and re-reads
// release_plan_drafts fresh via approvePlanDraft. The review scene edits the
// draft through the existing PUT /plan autosave, so the row on screen when a
// manager taps Approve is already the row in the database — carrying a copy
// of the run's output through this call would risk approving something
// staler than what they saw.
//
// EVERY WRITE IS SCOPED TO THE RELEASE OWNER, never the acting teammate —
// release_plan_drafts.owner_user_id and releases.owner_user_id are already
// keyed on the release's owner, matching the "child rows are stamped with the
// release owner, never the acting teammate" rule every other team-aware scene
// follows. Team RESOLUTION (who may be assigned) is different: that is
// genuinely release-scoped rather than storage-scoped, so it uses the real
// caller.
//
// ACCESS IS 'owner_write', NOT 'team_write' — even though the release itself
// is visible to the whole team. release_plan_drafts and every legacy
// /plan/* route (GET/PUT/DELETE, approve, regenerate-phase) are still
// owner-keyed in eight places, a deliberate, RECORDED deferral (see
// lib/release-access-guard.test.ts's own header: "plan is deferred"). A
// team-write teammate could tap this button, clear the entitlement gate, and
// then hit a 404 loading the very draft they just created, from the
// still-owner-only GET /plan. See ../types.ts's UrgansActionAccessLevel
// comment for the full reasoning and what a non-owner team member sees
// instead — the same 404 a stranger would, never a 403 that would confirm
// ownership.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  approvePlanDraft,
  discardPlanDraft,
  generatePlanDraft,
  getPlannerTemplate,
  type PlannerReleaseRow,
} from '../../release-planning-actions-server';
import { buildAutoIntake, parseReleasePlanIntake, type ReleasePlanIntake } from '../../release-planning';
import { resolveReleaseTaskWorkspace } from '../../tasks-server';
import type { AiUsage } from '../../ai/provider';
import type { WorkspaceMember } from '@/types/auth';
import type { UrgansActionDefinition } from '../types';

export type ReleaseDraftPlanInput = {
  /** Raw, untrusted intake answers from the refine-mode modal — validated by
   *  parseReleasePlanIntake inside execute. Absent means the one-tap path:
   *  derive everything via buildAutoIntake. */
  intake?: unknown;
  /** Replace an existing draft rather than refusing when one is already
   *  there — the refine modal's re-submission case. */
  replace?: boolean;
};

export type ReleaseDraftPlanOutput = {
  draftId: string;
  aiApplied: boolean;
  aiFailure: string | null;
  rationale: string | null;
};

export type ReleaseDraftPlanResult = {
  tasksCreated: number;
  taskIds: string[];
  warnings: string[];
};

/**
 * A small, deliberate duplicate of the same select as the plan route group's
 * loadOwnedRelease (app/api/releases/[releaseId]/plan/_shared.ts) — see that
 * file's own header, and release-planning-actions-server.ts's, for why these
 * small private duplicates are preferred here over a lib module reaching into
 * an app/api route group's helpers. This one skips the owner-only check
 * entirely: by the time execute()/apply()/discard() run, resolveActionScope
 * has already decided whether this caller may act on this release.
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
 *  as the legacy plan route group's loadPlannerTeam does — generation and
 *  the owner-history heuristic both degrade gracefully to "everything stays
 *  with the owner" rather than failing the whole run. */
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
    console.error('[urgans-actions] could not resolve the team for release', releaseId, error);
    return { ok: false };
  }
}

const todayYmd = (): string => new Date().toISOString().slice(0, 10);

export const releaseDraftPlanAction: UrgansActionDefinition<
  ReleaseDraftPlanInput,
  ReleaseDraftPlanOutput,
  ReleaseDraftPlanResult
> = {
  id: 'release.draft_plan',
  label: 'Draft the rollout plan',
  objectTypes: ['release'],
  access: 'owner_write',
  promptVersion: 'release.draft_plan.v1',

  async execute({ admin, objectId, actor, ownerUserId, input }) {
    const release = await loadReleaseRow(admin, objectId);
    if (!release) return { ok: false, status: 404, error: 'Release not found.' };

    let intake: ReleasePlanIntake;
    if (input?.intake !== undefined) {
      const parsed = parseReleasePlanIntake(input.intake);
      if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
      intake = parsed.intake;
    } else {
      intake = buildAutoIntake(release);
    }

    const { template, fallbackToSingle } = getPlannerTemplate(intake.release_type);

    let usage: AiUsage | null = null;

    const result = await generatePlanDraft(admin, {
      release,
      actor: { id: ownerUserId, email: actor.email },
      intake,
      replace: input?.replace === true,
      todayYmd: todayYmd(),
      template,
      fallbackToSingle,
      loadTeam: () => loadTeamForRelease(admin, objectId, actor),
      plannerModel: process.env.AI_PLANNER_MODEL || undefined,
      onUsage: (reported) => {
        usage = reported;
      },
    });

    if (!result.ok) {
      return { ok: false, status: result.status, error: result.error };
    }

    return {
      ok: true,
      output: {
        draftId: result.draft.id,
        aiApplied: result.draft.doc.ai.applied,
        aiFailure: result.draft.doc.ai.failure,
        rationale: result.draft.doc.ai.rationale,
      },
      // A short, loggable summary — never the ~60-task document itself, which
      // lives under its own autosave loop and would go stale in the log the
      // instant the manager edited a row.
      inputSummary: {
        intakeSource: intake.intake_source ?? 'answered',
        releaseType: intake.release_type,
        replace: input?.replace === true,
      },
      model: process.env.AI_PLANNER_MODEL || null,
      tokensIn: usage ? (usage as AiUsage).promptTokens : null,
      tokensOut: usage ? (usage as AiUsage).completionTokens : null,
    };
  },

  async apply({ admin, objectId, actor, ownerUserId }) {
    const release = await loadReleaseRow(admin, objectId);
    if (!release) return { ok: false, status: 404, error: 'Release not found.' };

    const result = await approvePlanDraft(admin, {
      release,
      actor: { id: ownerUserId },
      loadTeam: () => loadTeamForRelease(admin, objectId, actor),
    });

    if (!result.ok) return { ok: false, status: result.status, error: result.error };
    return {
      ok: true,
      result: {
        tasksCreated: result.tasksCreated,
        taskIds: result.taskIds,
        warnings: result.warnings,
      },
    };
  },

  async discard({ admin, objectId, ownerUserId }) {
    const result = await discardPlanDraft(admin, { releaseId: objectId, ownerUserId });
    if (!result.ok) return { ok: false, status: result.status, error: result.error };
    return { ok: true };
  },
};
