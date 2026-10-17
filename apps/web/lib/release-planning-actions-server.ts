/**
 * Building a rollout plan straight into its activities.
 *
 * ONE implementation, used by POST /api/releases/[releaseId]/plan (which the
 * intake modal and the chat interview both call) and by the release.draft_plan
 * embedded action (lib/urgans-actions/actions/release-draft-plan.ts). Until
 * 2026-09-15 this module held three steps — generate a draft, approve it,
 * discard it — with a review scene between the first two. The review step is
 * gone (founder call): the answers to the planning questions ARE the
 * decision, the plan lands as activities the manager edits like any other,
 * and there is no draft to approve or discard.
 *
 * DELIBERATELY NOT COUPLED TO NextResponse OR ANY OTHER NEXT.JS TYPE. The
 * embedded-action runner is not an HTTP handler, so this returns a plain
 * discriminated union ({ ok: true, plan } | { ok: false, status, error,
 * code }); each caller turns that into whatever envelope it needs. Same
 * boundary release-planning-server.ts draws for buildTaskRowsFromDraft /
 * instantiateDraftPlan.
 *
 * THE ORDER IS THE DESIGN. Everything that can refuse does so before anything
 * is written, and the one model call sits between the deterministic work and
 * the first write, so a model failure never leaves a half-built plan:
 *
 *   1. the date (row first, the manager's answer second; neither → 400)
 *   2. refuse a second plan (existing activities, or an approved plan row)
 *   3. save the answers on the release (the manager keeps them either way)
 *   4. the playbook draft, then the owner-history heuristic
 *   5. the manager's own exclusions, applied by CODE — a chip on the last
 *      question, and "no budget" ruling out paid ads. These hold whether or
 *      not a model ever answers, which is what makes "no marketing" a
 *      promise rather than a hope.
 *   6. the model's delta over the tasks that are left (validated whole; a
 *      required task may only go inside a scope the manager ruled out)
 *   7. the plan row: inserted approved, or a stale draft row CLAIMED with a
 *      conditional update — the row is the lock, so two calls cannot both
 *      build the same plan
 *   8. the activities, in one insert
 *   9. settle the release: pending markers cleared, planned_by_urgans stamped
 *
 * The `release_plan_drafts` table keeps its name. Its row is no longer a
 * draft anyone edits; it is the record of what was built, which is what the
 * "UrgAns built this plan" summary reads back.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  PLANNER_DELTA_JSON_SCHEMA,
  activeDraftTasks,
  applyDeltaToDraft,
  applyOwnerProposals,
  applyPreset,
  applyScopeExclusions,
  buildDraftFromTemplate,
  buildPlannerMessages,
  deriveIntakeExclusions,
  deriveScheduleWarnings,
  isTaskPreCompletedByReady,
  offsetFromTaskYmd,
  parsePlannerAiDelta,
  sanitizePlannerDelta,
  summarizeRemovedTasks,
  toPromptTasks,
  type CreatedPlan,
  type PlannerOnboardingContext,
  type PlannerAiDelta,
  type PlannerPromptMember,
  type PlanDraftFailure,
  type ReleasePlanDraftDoc,
  type ReleasePlanIntake,
  type RemovedTaskSummary,
} from './release-planning';
// Re-exported so the pipeline's own test file and any server caller can keep
// importing them from here; the definitions moved to lib/release-planning.ts
// (pure) the day the browser needed the same list for the plan summary.
export { summarizeRemovedTasks };
export type { CreatedPlan, RemovedTaskSummary };
import { isAiConfigured, type AiUsage, type ReasoningEffort } from './ai/provider';
import { generateRoutedStructuredOutput } from './ai/routed';
import type { FailedCall } from './ai/usage-log';
import type { RoutingTrace, TeamForRouting } from './ai/model-router';
import { getTemplate } from './release-templates/loader';
import { markCoreTasks } from './plan-core';
import type { Template } from './release-templates/types';
import { instantiateDraftPlan, PlanApprovalError } from './release-planning-server';
import { writePlannerPending } from './release-planner-pending';
import { writeTemplatePending } from './release-template-pending';
import { writePlannedByUrgans } from './release-planned-by-urgans';
import { loadPastAssignments } from './task-owners-server';
import { proposeTaskOwners, type AssignableMember } from './task-owners';
import type { WorkspaceMember } from '@/types/auth';
import { ONBOARDING_WHERE_STUCK_OPTIONS } from './onboarding-draft';
import { ONBOARDING_PLANNING_PREFERENCE_LABELS, isOnboardingPlanningPreference } from './onboarding';

const PLAN_DRAFTS_TABLE = 'release_plan_drafts';
const RELEASES_TABLE = 'releases';

/**
 * The model call's budget, sized against the route's 60s ceiling (Vercel's
 * Hobby plan maximum, which cannot be raised in code). One attempt may run
 * 40s; a second is allowed only while at least 8s of the deadline remain,
 * and the deadline itself sits 52s after the route started, so the abort
 * fires and the plan is still written inside the ceiling. The provider does
 * the arithmetic per attempt (see deadlineMs on generateStructuredAiOutput);
 * these three numbers are the whole budget, and moving one means re-checking
 * the other two against maxDuration.
 */
export const PLANNER_TIMEOUT_MS = 40_000;
export const PLANNER_MAX_RETRIES = 2;
export const PLANNER_DEADLINE_MS = 52_000;

/**
 * The planner's output cap (2026-10-17). Without one, RodiumAi caps every
 * answer at 2,048 tokens, and on a reasoning model the hidden reasoning counts
 * against that too: every gpt-5 plan Oct 11 to 16 came back cut off at exactly
 * 2,048 and failed to parse, so each first plan fell back to the playbook.
 * 4,096 covers low-effort reasoning plus the delta (gpt-5.4 wrote 1,713 in all
 * on a real plan, Oct 10) and still streams inside one 40s attempt.
 */
export const PLANNER_MAX_OUTPUT_TOKENS = 4_096;

/**
 * The playbook a plan is built from, chosen by the intake's release type.
 *
 * EP and album have their own playbooks, but they sit behind
 * NEXT_PUBLIC_FEATURE_EP_ALBUM_TEMPLATES, so getTemplate throws for them while
 * the flag is off. That is not an error here: the single playbook is a valid
 * plan for any release, so the fallback is silent to the user except for one
 * honest line in the prompt guidance — which is why `fallbackToSingle` is
 * returned rather than swallowed.
 *
 * music_video reaches this as neither ('single' | 'ep' | 'album' is the intake's
 * whole vocabulary), so it cannot get here at all.
 */
export function getPlannerTemplate(releaseType?: string | null): {
  template: Template;
  fallbackToSingle: boolean;
} {
  if (releaseType === 'ep' || releaseType === 'album') {
    try {
      return { template: getTemplate(releaseType), fallbackToSingle: false };
    } catch {
      // TemplateNotAvailableError — the flag is off. Fall through.
    }
    return { template: getTemplate('single'), fallbackToSingle: true };
  }
  return { template: getTemplate('single'), fallbackToSingle: false };
}

export type PlannerReleaseRow = {
  id: string;
  owner_user_id: string;
  title: string | null;
  artist_name: string | null;
  release_date: string | null;
  release_type: string | null;
  release_context: unknown;
  metadata: Record<string, unknown> | null;
};

/**
 * Turn a provider failure into the reason recorded on the plan. Reads the
 * error's shape rather than its class — AiProviderError is not exported from
 * lib/ai/provider.ts.
 */
export function classifyPlannerFailure(error: unknown): PlanDraftFailure {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const status = (error as { status?: number } | null)?.status;
  const name = (error as { name?: string } | null)?.name;

  if (name === 'AbortError' || /abort|timed? ?out|deadline/i.test(message)) return 'timeout';
  if (status === 429 || /rate[- ]limit/i.test(message)) return 'busy';
  if (/parse|json|format/i.test(message)) return 'invalid_output';
  return 'unavailable';
}

// ---------------------------------------------------------------------------
// The pure decisions
// ---------------------------------------------------------------------------

/**
 * Which date the plan is built against. The release row wins: the manager's
 * answer was true when they gave it, and the row may have moved since. The
 * answer is the fallback for a release that never had a date, which the
 * pipeline then writes onto the row so the activities and the release agree.
 */
export function resolvePlanReleaseDate(
  rowReleaseDate: string | null | undefined,
  intake: Pick<ReleasePlanIntake, 'release_date'>
): { releaseDate: string; fromIntake: boolean } | null {
  const fromRow = rowReleaseDate ? String(rowReleaseDate).slice(0, 10) : '';
  if (fromRow) return { releaseDate: fromRow, fromIntake: false };
  const fromIntake = intake.release_date ? String(intake.release_date).slice(0, 10) : '';
  if (fromIntake) return { releaseDate: fromIntake, fromIntake: true };
  return null;
}

export type AiFailureDecision =
  | { action: 'proceed'; warning: string | null }
  | { action: 'refuse'; status: 503; code: 'tailoring_unavailable'; error: string };

const NOTES_UNREAD_ERROR = 'UrgAns could not read your notes just now. Try again in a moment.';
const UNTAILORED_WARNING =
  'UrgAns could not tailor the rest this time. The plan follows the playbook and your answers.';
const FIRST_PLAN_NOTES_WARNING =
  'UrgAns could not read your notes this time. Your first plan follows the playbook and your selected answers.';
const NOT_CONFIGURED_NOTES_WARNING =
  'UrgAns is not set up to read notes on this environment. The plan follows the playbook and your selected answers.';

/**
 * What a model failure does to the request (founder call, 2026-09-12).
 *
 * The line is whether the manager TYPED anything. Selected answers are
 * honoured by code before the model is ever asked — the chips, the budget,
 * the readiness list all shape the plan deterministically — so with nothing
 * typed, a failed model call costs only the polish and the plan can be built
 * from the answers with a plain warning. Typed text is different: "a normal
 * release, no marketing" in the notes is an instruction only the model can
 * read, and a plan built while ignoring it would be the wrong plan with no
 * way to tell. So with text present the request is REFUSED before anything
 * is written, the answers are kept, and the manager tries again.
 *
 * `not_configured` is not a one-off failure but the documented degrade (the
 * product works with no model at all), so it never refuses; with typed notes
 * it says plainly that they were not read.
 */
export function decidePlanCreationOnAiFailure(
  failure: PlanDraftFailure,
  intake: Pick<ReleasePlanIntake, 'extra_notes' | 'goal_text'>,
  options: { firstPlan?: boolean } = {}
): AiFailureDecision {
  const typedText = Boolean(intake.extra_notes?.trim()) || Boolean(intake.goal_text?.trim());

  if (failure === 'not_configured') {
    return { action: 'proceed', warning: typedText ? NOT_CONFIGURED_NOTES_WARNING : null };
  }
  // A team's FIRST plan is never refused (2026-10-11, the hybrid first plan):
  // it is the moment a brand-new manager, straight out of onboarding, sees
  // what the product does, and a "try again" there is the worst first
  // impression available. The backbone (playbook, dates, readiness, their
  // selected answers) is built and saved, the failure is recorded on the
  // document, and the warning says plainly the typed text was not read.
  if (typedText && options.firstPlan) {
    return { action: 'proceed', warning: FIRST_PLAN_NOTES_WARNING };
  }
  if (typedText) {
    return { action: 'refuse', status: 503, code: 'tailoring_unavailable', error: NOTES_UNREAD_ERROR };
  }
  return { action: 'proceed', warning: UNTAILORED_WARNING };
}

// ---------------------------------------------------------------------------
// Reads the pipeline needs
// ---------------------------------------------------------------------------

type PlanRowHead = { id: string; status: string };

async function readPlanRow(
  admin: SupabaseClient,
  releaseId: string
): Promise<{ error: string } | { row: PlanRowHead | null }> {
  // Status only: a stale draft's document is about to be overwritten, so
  // whether it still parses is not this pipeline's problem.
  const { data, error } = await admin
    .from(PLAN_DRAFTS_TABLE)
    .select('id,status')
    .eq('release_id', releaseId)
    .maybeSingle();

  if (error) return { error: error.message || 'Could not check this rollout for a plan.' };
  return { row: (data as PlanRowHead | null) ?? null };
}

async function countAutoGeneratedTasks(
  admin: SupabaseClient,
  releaseId: string
): Promise<{ error: string } | { count: number }> {
  const { count, error } = await admin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('release_id', releaseId)
    .eq('auto_generated', true);

  if (error) {
    return { error: error.message || 'Could not check this rollout for existing activities.' };
  }
  return { count: count ?? 0 };
}

/**
 * The team the planner may hand work to. Only members who have actually
 * joined can hold a task: `assigned_to_user_id` is a real auth user id.
 */
function toAssignableMembers(
  members: WorkspaceMember[]
): { prompt: PlannerPromptMember[]; ids: Set<string>; assignable: AssignableMember[]; names: Record<string, string> } {
  const joined = members.filter((member) => Boolean(member.userId));
  const names: Record<string, string> = {};
  for (const member of joined) {
    names[member.userId as string] = member.name || member.email || 'Teammate';
  }
  return {
    prompt: joined.map((member) => ({
      user_id: member.userId as string,
      name: member.name || member.email || 'Teammate',
      role: member.role,
    })),
    ids: new Set(joined.map((member) => member.userId as string)),
    assignable: joined.map((member) => ({
      userId: member.userId as string,
      status: member.status,
      role: member.role,
    })),
    names,
  };
}

/**
 * What the manager told us at signup, for the tailoring prompt: the pain
 * points from "Where does a rollout usually fall apart?" and the planning
 * preference, both already stored on the profile by the onboarding PATCH
 * (URG-158, URG-192). Best effort: an unreadable profile is an empty context,
 * never a failed plan.
 */
export async function readPlannerOnboardingContext(
  admin: SupabaseClient,
  userId: string
): Promise<PlannerOnboardingContext | null> {
  try {
    const { data, error } = await admin
      .from('profiles')
      .select('onboarding_where_stuck,onboarding_planning_preference')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return toPlannerOnboardingContext(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Pure half of {@link readPlannerOnboardingContext}: profile columns to labels. */
export function toPlannerOnboardingContext(row: Record<string, unknown>): PlannerOnboardingContext | null {
  const stuck = Array.isArray(row.onboarding_where_stuck) ? row.onboarding_where_stuck : [];
  const painPoints = stuck
    .map((value) => ONBOARDING_WHERE_STUCK_OPTIONS.find((option) => option.value === value)?.label)
    .filter((label): label is string => Boolean(label));
  const preference = isOnboardingPlanningPreference(row.onboarding_planning_preference)
    ? ONBOARDING_PLANNING_PREFERENCE_LABELS[row.onboarding_planning_preference]
    : null;
  if (painPoints.length === 0 && !preference) return null;
  return { painPoints, planningPreference: preference };
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export type CreateReleasePlanCode =
  | 'missing_release_date'
  | 'tasks_exist'
  | 'plan_in_progress'
  | 'tailoring_unavailable';

export type CreateReleasePlanResult =
  | { ok: true; plan: CreatedPlan }
  | { ok: false; status: number; error: string; code?: CreateReleasePlanCode };

export async function createReleasePlan(
  admin: SupabaseClient,
  params: {
    release: PlannerReleaseRow;
    actor: { id: string; email?: string | null };
    intake: ReleasePlanIntake;
    todayYmd: string;
    template: Template;
    fallbackToSingle: boolean;
    loadTeam: () => Promise<{ ok: true; workspaceId: string; members: WorkspaceMember[] } | { ok: false }>;
    /**
     * The team's billing state and tier, for the model router's plan ceiling
     * (lib/ai/routing-team-server.ts reads it). Only the router looks at it: with
     * the router off, or without this, the model is exactly what
     * lib/ai/planner-model.ts resolves, as before.
     */
    routingTeam?: TeamForRouting;
    /** An explicit effort (AI_PLANNER_REASONING_EFFORT) beats the rung's own. */
    reasoningEffort?: ReasoningEffort;
    /** Absolute; the route passes its own start plus PLANNER_DEADLINE_MS. */
    deadlineMs?: number;
    /** Reports token usage for the tailoring call, once per attempt that
     *  returned a payload (see lib/ai/provider.ts's own contract) — for the
     *  embedded action's urgans_actions logging. */
    onUsage?: (usage: AiUsage) => void;
    /** Reports each tailoring attempt that returned no answer, for the usage log. */
    onFailure?: (failure: FailedCall) => void;
    /** What the model router did for the tailoring call, once, when it did
     *  anything (never with the router off). Which model really answered is
     *  the last entry of `models`. */
    onTrace?: (trace: RoutingTrace) => void;
    /** This is the team's first plan (credits/first-plan.ts's facts). A first
     *  plan is never refused over a model failure; see
     *  decidePlanCreationOnAiFailure. Absent = not first, the old behaviour. */
    firstPlan?: boolean;
    /** Signup answers for the prompt. Absent = read from the actor's profile. */
    onboarding?: PlannerOnboardingContext | null;
  }
): Promise<CreateReleasePlanResult> {
  const {
    release,
    actor,
    intake,
    todayYmd,
    template,
    fallbackToSingle,
    loadTeam,
    routingTeam,
    reasoningEffort,
    deadlineMs,
    onUsage,
    onFailure,
    onTrace,
    firstPlan = false,
  } = params;
  const releaseId = release.id;

  // --- 1. The date --------------------------------------------------------------

  const resolvedDate = resolvePlanReleaseDate(release.release_date, intake);
  if (!resolvedDate) {
    return { ok: false, status: 400, error: 'Set a release date first.', code: 'missing_release_date' };
  }
  const { releaseDate } = resolvedDate;

  // --- 2. Refuse a second plan ------------------------------------------------

  const taskCount = await countAutoGeneratedTasks(admin, releaseId);
  if ('error' in taskCount) return { ok: false, status: 500, error: taskCount.error };
  if (taskCount.count > 0) {
    return { ok: false, status: 409, error: 'This rollout already has its plan.', code: 'tasks_exist' };
  }

  const existingRow = await readPlanRow(admin, releaseId);
  if ('error' in existingRow) return { ok: false, status: 500, error: existingRow.error };
  if (existingRow.row?.status === 'approved') {
    return { ok: false, status: 409, error: 'This rollout already has its plan.', code: 'tasks_exist' };
  }

  // --- 3. Save the answers ----------------------------------------------------

  // The date is written only when the row had none: a release the manager
  // dated elsewhere keeps that date, and a failure to record an answered date
  // is fatal, because activities dated against a day the release does not
  // carry would be wrong in a way nothing on screen could explain.
  const contextSave = await admin
    .from(RELEASES_TABLE)
    .update({
      release_context: intake,
      release_type: intake.release_type,
      ...(resolvedDate.fromIntake ? { release_date: releaseDate } : {}),
    })
    .eq('id', releaseId)
    .eq('owner_user_id', actor.id);
  if (contextSave.error) {
    if (resolvedDate.fromIntake) {
      return { ok: false, status: 500, error: 'Could not save the release date. Try again.' };
    }
    console.error('[plan] could not save intake answers:', contextSave.error);
    // Non-fatal: the answers also travel inside the plan document below.
  }

  // --- 4. The playbook draft, then the owner-history heuristic ---------------

  let doc: ReleasePlanDraftDoc = buildDraftFromTemplate({
    template,
    intake,
    ownerUserId: actor.id,
    generatedAt: new Date().toISOString(),
  });

  const team = await loadTeam();
  if (!team.ok) {
    // Needed to file the activities, so learn it now rather than after a
    // model call that would then be thrown away.
    return {
      ok: false,
      status: 500,
      error: 'Could not work out where to file these activities. Try again.',
    };
  }
  const assignable = toAssignableMembers(team.members);

  const history = await loadPastAssignments(admin, {
    workspaceId: team.workspaceId,
    ownerUserId: actor.id,
    excludeReleaseId: releaseId,
  });
  const proposals = proposeTaskOwners({
    tasks: doc.tasks.map((task) => ({
      id: task.id,
      templateTaskId: task.template_task_id,
      role: task.role,
    })),
    history,
    members: assignable.assignable,
    creatorUserId: actor.id,
    memberNames: assignable.names,
  });
  doc = applyOwnerProposals(doc, proposals);

  // --- 5. A named preset, then the manager's own exclusions, by code ---------

  // Applied first and unconditionally when named: a preset is a much more
  // restrictive keep-list than any combination of scope exclusions, so
  // running it before the exclusions below just means those find nothing
  // further to remove — never that they disagree.
  if (intake.preset) {
    doc = applyPreset(doc, intake.preset);
  }
  doc = applyScopeExclusions(doc, deriveIntakeExclusions(intake));

  // --- 6. The model's delta over what is left --------------------------------

  const warnings: string[] = [];
  let delta: PlannerAiDelta | null = null;
  let failure: PlanDraftFailure | null = null;

  if (!isAiConfigured()) {
    failure = 'not_configured';
  } else {
    const remaining = activeDraftTasks(doc);
    const onboarding =
      params.onboarding !== undefined
        ? params.onboarding
        : await readPlannerOnboardingContext(admin, actor.id);
    const messages = buildPlannerMessages({
      release: {
        title: release.title || '',
        artistName: release.artist_name || intake.artist_name,
        releaseDate,
      },
      intake,
      tasks: toPromptTasks(remaining),
      members: assignable.prompt,
      todayYmd,
      fallbackToSingle,
      appliedExclusions: doc.applied_exclusions,
      onboarding,
    });

    try {
      // Routed: with the router off this is the call the planner always made
      // (the model lib/ai/planner-model.ts resolves, the same schema, effort
      // and deadline). With it on, the planner starts no lower than the pro
      // rung and may move to a sibling or a stronger model if that one fails.
      delta = await generateRoutedStructuredOutput<PlannerAiDelta>({
        surface: 'planner',
        team: routingTeam,
        messages,
        timeoutMs: PLANNER_TIMEOUT_MS,
        maxRetries: PLANNER_MAX_RETRIES,
        parse: parsePlannerAiDelta,
        invalidFormatMessage: 'The response was not the expected JSON.',
        jsonSchema: { name: 'planner_delta', schema: PLANNER_DELTA_JSON_SCHEMA },
        maxOutputTokens: PLANNER_MAX_OUTPUT_TOKENS,
        reasoningEffort,
        deadlineMs,
        onUsage,
        onFailure,
        onTrace,
      });
    } catch (error) {
      failure = classifyPlannerFailure(error);
      console.error('[plan] tailoring failed for rollout', releaseId, failure, error);
    }

    if (delta) {
      // Item by item since 2026-10-11: a bad id, a protected drop or an
      // invalid add is dropped on its own and the rest of the delta stands.
      // The plan's window is the playbook's own date range; an added task
      // also may not land before today.
      const templateOffsets = template.tasks.map((task) => task.offset_days);
      const { delta: clean, rejected } = sanitizePlannerDelta(delta, {
        tasks: remaining.map((task) => ({
          id: task.id,
          optional: task.optional,
          tags: task.tags,
          title: task.title,
          offset_days: task.offset_days,
        })),
        memberUserIds: Array.from(assignable.ids),
        excludedScopes: doc.applied_exclusions.map((entry) => entry.scope),
        budget: intake.budget,
        preset: intake.preset,
        todayOffset: offsetFromTaskYmd(releaseDate, todayYmd),
        window: templateOffsets.length
          ? { min: Math.min(...templateOffsets), max: Math.max(...templateOffsets) }
          : undefined,
      });
      if (rejected.length) {
        console.error('[plan] tailoring items refused for rollout', releaseId, rejected.length, rejected);
      }
      delta = clean;
      doc = applyDeltaToDraft(doc, clean, { ownerUserId: actor.id, rejectedItems: rejected.length });
    }
  }

  if (failure) {
    const decision = decidePlanCreationOnAiFailure(failure, intake, { firstPlan });
    if (decision.action === 'refuse') {
      // Nothing has been written to the plan yet. The answers were saved in
      // step 3, so the manager comes back to the same questions filled in.
      return { ok: false, status: decision.status, error: decision.error, code: decision.code };
    }
    doc = { ...doc, ai: { applied: false, rationale: null, failure } };
    if (decision.warning) warnings.push(decision.warning);
  }

  // --- 6b. The core (URG-318) -------------------------------------------------
  // 12 to 15 tasks across the three phases become activities; the rest of what
  // is left stays in this document as one-tap suggestions. Runs whether or not
  // the model answered, so a plan built without UrgAns is just as small.
  doc = markCoreTasks(
    doc,
    (task) =>
      task.origin === 'template' &&
      isTaskPreCompletedByReady(task, doc.intake.ready_today, doc.template_id)
  );

  // --- 7. The plan row: insert it built, or claim a stale draft --------------

  const approvedAt = new Date();
  const approvedAtIso = approvedAt.toISOString();
  let planRowId: string;

  if (!existingRow.row) {
    const inserted = await admin
      .from(PLAN_DRAFTS_TABLE)
      .insert({
        owner_user_id: actor.id,
        release_id: releaseId,
        status: 'approved',
        doc,
        approved_at: approvedAtIso,
        approved_task_count: null,
      })
      .select('id')
      .single();

    if (inserted.error) {
      // 23505: another call inserted the row between our read and now. Its
      // plan is the real one.
      if (inserted.error.code === '23505') {
        return {
          ok: false,
          status: 409,
          error: 'This plan is already being created.',
          code: 'plan_in_progress',
        };
      }
      return { ok: false, status: 500, error: inserted.error.message || 'Could not save the plan.' };
    }
    planRowId = (inserted.data as { id: string }).id;
  } else {
    // A draft left by the old review flow, or by a build that failed after
    // claiming. The conditional update is the lock: whoever flips it from
    // 'draft' builds, everyone else answers 409.
    const claim = await admin
      .from(PLAN_DRAFTS_TABLE)
      .update({ status: 'approved', approved_at: approvedAtIso, doc, approved_task_count: null })
      .eq('id', existingRow.row.id)
      .eq('status', 'draft')
      .select('id');

    if (claim.error) {
      return { ok: false, status: 500, error: claim.error.message || 'Could not save the plan.' };
    }
    if ((claim.data || []).length === 0) {
      return {
        ok: false,
        status: 409,
        error: 'This plan is already being created.',
        code: 'plan_in_progress',
      };
    }
    planRowId = existingRow.row.id;
  }

  // --- 8. The activities ------------------------------------------------------

  // The owner can always hold a task, whatever the membership rows say.
  assignable.ids.add(actor.id);

  let created: { tasksCreated: number; taskIds: string[]; warnings: string[] };
  try {
    created = await instantiateDraftPlan({
      doc,
      draftId: planRowId,
      releaseId,
      releaseDate,
      workspaceId: team.workspaceId,
      ownerUserId: actor.id,
      assignableUserIds: assignable.ids,
      approvedAtMs: approvedAt.getTime(),
      supabaseClient: admin,
    });
  } catch (error) {
    // Put the row back to 'draft' so the next attempt claims it rather than
    // being told the plan exists. Same move for a row this call inserted: a
    // leftover draft row is harmless, an approved row with no activities
    // behind it would refuse every later attempt.
    const released = await admin
      .from(PLAN_DRAFTS_TABLE)
      .update({ status: 'draft', approved_at: null })
      .eq('id', planRowId);
    if (released.error) {
      console.error('[plan] could not release the plan row after a failed build:', released.error);
    }

    if (error instanceof PlanApprovalError && error.reason === 'empty_plan') {
      // Cannot happen with the playbooks as written (release-day work is
      // never removable), so if it ever does, say so plainly.
      return { ok: false, status: 500, error: 'The plan came out empty. Try again.' };
    }

    console.error('[plan] building the plan failed for rollout', releaseId, error);
    return { ok: false, status: 500, error: 'Could not build the plan. Nothing was created. Try again.' };
  }

  // --- 9. Settle the release --------------------------------------------------

  const nextMetadata = writePlannedByUrgans(
    writeTemplatePending(writePlannerPending(release.metadata, false), false),
    true
  );

  const settle = await admin
    .from(RELEASES_TABLE)
    .update({ metadata: nextMetadata })
    .eq('id', releaseId)
    .eq('owner_user_id', actor.id);
  if (settle.error) {
    console.error('[plan] activities created but the rollout flags did not clear:', settle.error);
  }

  const stamp = await admin
    .from(PLAN_DRAFTS_TABLE)
    .update({ approved_task_count: created.tasksCreated })
    .eq('id', planRowId);
  if (stamp.error) {
    console.error('[plan] activities created but the plan count did not stamp:', stamp.error);
  }

  if (delta) {
    const audit = await admin
      .from(RELEASES_TABLE)
      .update({ ai_tailoring_response: { ...delta, tailored_at: approvedAtIso } })
      .eq('id', releaseId);
    if (audit.error) {
      console.error('[plan] plan built but the audit record did not save:', audit.error);
    }
  }

  return {
    ok: true,
    plan: {
      tasksCreated: created.tasksCreated,
      taskIds: created.taskIds,
      warnings: [
        ...created.warnings,
        ...warnings,
        ...(doc.ai.warnings ?? []),
        ...deriveScheduleWarnings(doc, releaseDate, todayYmd),
      ],
      removed: summarizeRemovedTasks(doc),
      appliedExclusions: doc.applied_exclusions,
      rationale: doc.ai.rationale,
      aiApplied: doc.ai.applied,
      aiFailure: doc.ai.failure,
      releaseDate,
    },
  };
}
