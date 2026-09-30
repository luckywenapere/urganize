// Release planner tools (SERVER-ONLY) — the rollout questionnaire, run in
// conversation instead of through the seven-screen modal.
//
// The division of labour matters and is easy to get wrong:
//
// - The MODEL collects the seven answers in natural language and normalizes
//   them to the enum values. It is good at that, and it is the whole point of
//   putting the questionnaire in the chat.
// - `parseReleasePlanIntake` — the same validator the modal's route uses — is
//   what decides whether those answers are actually valid. Its per-field error
//   is relayed verbatim so the model can re-ask ONE question rather than
//   restarting the interview.
// - The PLAN itself still comes from the hand-crafted playbook. Nothing here
//   lets the model invent tasks: generate_release_plan calls the SAME
//   createReleasePlan pipeline the workspace card does, which applies a
//   validated delta to a deterministic draft and instantiates it in one move.
//
// SINCE 2026-09-15 THERE IS NO DRAFT TO APPROVE. Finishing the questions BUILDS
// the plan straight into the rollout's activities — there is nothing left to
// review or discard, so those two tools are gone. generate_release_plan is
// therefore ungated (no confirmation card): the manager already agreed by
// reading the questions back, and every activity it creates is editable
// afterward like any other.
//
// generate_release_plan IS THE CHAT DOOR ONTO release.draft_plan, the embedded
// action a button inside the release runs. It reaches the plan through the
// same POST /plan route the workspace card uses, so it needs none of the
// action runner — but it DOES log to urgans_actions, or /admin/urgans would be
// blind to half the building that happens. The gate is deliberately not
// shared: see lib/urgans-actions/chat-log-server.ts, which argues that. The
// log call is a one-shot 'applied' row (the write_press_kit_section
// precedent) — there was never a drafted row to settle, because the write IS
// the build.

import {
  PLAN_PRESET_LABELS,
  PLAN_PRESETS,
  PLAN_SCOPE_LABELS,
  RELEASE_TYPE_OPTIONS,
  buildPlanPreview,
  isPlanPreset,
  isReleasePlannerEnabled,
  parseReleasePlanIntake,
  type PlanReleaseType,
  type PlanScope,
  type ReleasePlanIntake,
} from '@/lib/release-planning';
import { getPlannerTemplate } from '@/lib/release-planning-actions-server';
import { recordChatActionRun } from '@/lib/urgans-actions/chat-log-server';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const PLANNER_OFF = "The rollout planner isn't enabled yet.";

/** The embedded action this tool is the chat door onto. */
const PLAN_ACTION = 'release.draft_plan';

/** Phase labels in the order a rollout actually runs, for the summary. */
const PHASE_ORDER = ['setup', 'pre_release', 'release_week', 'post_release'] as const;
const PHASE_LABELS: Record<string, string> = {
  setup: 'Setup',
  pre_release: 'Pre-release',
  release_week: 'Release week',
  post_release: 'Post-release',
};

/**
 * Shapes the model's arguments into an intake candidate and validates it.
 * `version` is injected here rather than asked of the model: it is a schema
 * discriminator, not one of the seven questions, and letting the model supply
 * it only creates a way for it to be wrong.
 *
 * Exported for tests — this is the seam where a conversational answer becomes
 * the same structure the modal produces.
 */
export function buildPlanIntake(
  args: Record<string, unknown>
): { ok: true; intake: ReleasePlanIntake } | { ok: false; error: string } {
  const candidate: Record<string, unknown> = {
    version: 2,
    release_type: args.release_type,
    artist_name: args.artist_name,
    date_mode: args.date_mode ?? 'fixed',
    release_date: args.release_date ?? null,
    ready_today: Array.isArray(args.ready_today) ? args.ready_today : [],
    goal: args.goal,
    budget: args.budget,
  };
  if (typeof args.goal_text === 'string' && args.goal_text.trim()) {
    candidate.goal_text = args.goal_text.trim();
  }
  if (Array.isArray(args.exclusions) && args.exclusions.length > 0) {
    candidate.exclusions = args.exclusions;
  }
  if (typeof args.extra_notes === 'string' && args.extra_notes.trim()) {
    candidate.extra_notes = args.extra_notes.trim();
  }
  if (typeof args.preset === 'string' && args.preset.trim()) {
    candidate.preset = args.preset.trim();
  }
  return parseReleasePlanIntake(candidate);
}

/** Per-phase counts instead of the whole document: a plan is ~60 tasks and
 * dumping it would crowd out the conversation it is supposed to support. */
function summarizePlanDoc(doc: Record<string, unknown>) {
  const tasks = Array.isArray(doc.tasks) ? (doc.tasks as Record<string, unknown>[]) : [];
  const byPhase = PHASE_ORDER.map((phase) => ({
    phase: PHASE_LABELS[phase] ?? phase,
    tasks: tasks.filter((task) => task.phase === phase).length,
  })).filter((entry) => entry.tasks > 0);
  const ai = (doc.ai ?? {}) as Record<string, unknown>;
  return {
    totalTasks: tasks.length,
    phases: byPhase,
    // Says whether the plan is the untailored playbook or a tailored one, so
    // the model does not claim tailoring that did not happen.
    tailored: !ai.failure,
    tailoringIssue: typeof ai.failure === 'string' ? ai.failure : null,
  };
}

/** Human labels for the scopes a build left out, for the chat reply. Unknown
 *  values (a future scope this file has not caught up with) fall back to the
 *  raw string rather than disappearing silently. */
function scopeLabels(appliedExclusions: unknown): string[] {
  if (!Array.isArray(appliedExclusions)) return [];
  const labels: string[] = [];
  for (const entry of appliedExclusions) {
    const scope = (entry as { scope?: unknown } | null)?.scope;
    if (typeof scope !== 'string') continue;
    labels.push(PLAN_SCOPE_LABELS[scope as PlanScope] ?? scope);
  }
  return labels;
}

export const PLANNER_TOOLS: ChappiTool[] = [
  {
    name: 'get_release_plan',
    kind: 'read',
    description:
      'Check whether a rollout has a plan yet, and how many activities landed in each phase. Returns a summary, not the full plan.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/plan`, { method: 'GET' });
      if (isFlagGateOff(res)) return fail(PLANNER_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not load the plan.'));

      const plan = res.body.plan as Record<string, unknown> | null;
      const releaseDate = (res.body.releaseDate ?? null) as string | null;
      if (!plan) {
        return {
          ok: true,
          summary: releaseDate
            ? 'No rollout plan yet. Collect the interview answers and build one with generate_release_plan.'
            : 'No plan yet, and the rollout has no date. A plan needs one before it can be built.',
          data: { hasPlan: false, releaseDate },
        };
      }

      const doc = (plan.doc ?? {}) as Record<string, unknown>;
      const summary = summarizePlanDoc(doc);
      return {
        ok: true,
        summary: `The plan is built: ${summary.totalTasks} activities.`,
        data: { hasPlan: true, releaseDate, ...summary },
      };
    },
  },
  {
    name: 'preview_release_plan',
    kind: 'read',
    description:
      "What the preview UrgAns reads its read-back from. Call this with whatever of the intake answers are collected so far, right before saying \"Here's what I'll build\" — it returns the REAL activity count, the resolved release date (fixed, or the deterministic suggestion when none was given yet), how many activities would already be dated before today, and, for an EP or album, the derived date(s) of the staggered single(s). Read these numbers back rather than guessing them; the model's own tailoring runs later and can only remove further, never add, so this is already the floor the manager can trust. Does not create anything.",
    inputSchema: {
      type: 'object',
      properties: {
        release_type: {
          type: 'string',
          enum: RELEASE_TYPE_OPTIONS.map((option) => option.value),
        },
        release_date: {
          type: 'string',
          description: 'YYYY-MM-DD, only if the user already gave one.',
        },
        ready_today: {
          type: 'array',
          items: { type: 'string' },
        },
        preset: { type: 'string', enum: [...PLAN_PRESETS] },
        exclusions: { type: 'array', items: { type: 'string' } },
        budget: { type: 'string' },
      },
      required: ['release_type'],
    },
    execute: async (_ctx, args) => {
      const releaseTypeArg = argString(args, 'release_type');
      const releaseType = RELEASE_TYPE_OPTIONS.some((option) => option.value === releaseTypeArg)
        ? (releaseTypeArg as PlanReleaseType)
        : null;
      if (!releaseType) {
        return fail(
          `release_type must be one of: ${RELEASE_TYPE_OPTIONS.map((o) => o.value).join(', ')}.`
        );
      }

      const { template, fallbackToSingle } = getPlannerTemplate(releaseType);
      const preset = isPlanPreset(args.preset) ? args.preset : undefined;
      const readyToday = Array.isArray(args.ready_today)
        ? args.ready_today.filter((item): item is string => typeof item === 'string')
        : [];
      const exclusions = Array.isArray(args.exclusions)
        ? args.exclusions.filter((item): item is string => typeof item === 'string')
        : undefined;
      const releaseDate = argString(args, 'release_date') || null;
      const budget = argString(args, 'budget') || undefined;

      const preview = buildPlanPreview({
        template,
        input: {
          release_date: releaseDate,
          // Garbage or unrecognized values simply match nothing below — the
          // underlying tag/id checks are all `.includes()` lookups, never a
          // throw — so nothing here needs to reject a bad string itself.
          ready_today: readyToday as ReleasePlanIntake['ready_today'],
          preset,
          exclusions: exclusions as PlanScope[] | undefined,
          budget: budget as ReleasePlanIntake['budget'] | undefined,
        },
        todayYmd: new Date().toISOString().slice(0, 10),
      });

      const dateLine = preview.dateWasSuggested
        ? `${preview.releaseDate} (a suggestion — nothing fixed yet)`
        : preview.releaseDate;
      const singleLine = preview.singleDates.length
        ? ` ${preview.singleDates.map((entry) => `${entry.label} on ${entry.date}`).join(', ')}.`
        : '';
      const lateLine =
        preview.lateCount > 0
          ? ` ${preview.lateCount} of those would already be dated before today — they land in Catch up, not a failure.`
          : '';
      const fallbackLine = fallbackToSingle
        ? ` (Planned from the single playbook — ${releaseType === 'ep' ? 'the EP' : 'the album'} playbook is not switched on here.)`
        : '';
      const presetLine = preset ? ` This is a ${PLAN_PRESET_LABELS[preset]}.` : '';

      return {
        ok: true,
        summary: `${preview.activityCount} of ${preview.totalTemplateTasks} activities.${presetLine} Release date: ${dateLine}.${singleLine}${lateLine}${fallbackLine}`,
        data: { ...preview, fallbackToSingle },
      };
    },
  },
  {
    name: 'generate_release_plan',
    kind: 'mutate',
    description:
      "Build the rollout's plan from the hand-crafted playbook straight into its activities, tailored to the intake answers. Collect the answers in conversation first, call preview_release_plan to get the real numbers, and read those back before calling this. Recognize \"quiet rollout\"/\"low-key\"/\"soft launch\"/\"no noise\" as the quiet preset, and a release day under 7 days away as the surprise preset, BEFORE running the full interview — either one only needs the artist, the date, and what is ready; skip the goal and budget questions and set goal to \"catalog\", budget to \"none\". Omit releaseId to create the rollout and build its plan in one call — the usual case for a brand-new rollout. This creates the activities immediately; there is no draft to approve afterward, so only call it once the answers are settled.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: {
          type: 'string',
          description:
            'Only for an existing rollout that has no activities yet. Omit to create the rollout and build its plan in one call.',
        },
        title: {
          type: 'string',
          description:
            'Title for the new rollout, when the user named one. Ignored when releaseId is passed.',
        },
        release_type: {
          type: 'string',
          enum: ['single', 'ep', 'album'],
          description: 'Q1 — what they are releasing.',
        },
        artist_name: { type: 'string', description: 'Q2 — the artist this rollout is for.' },
        release_date: {
          type: 'string',
          description: 'Q3 — release day, YYYY-MM-DD. Null only if genuinely undecided.',
        },
        date_mode: {
          type: 'string',
          enum: ['fixed', 'suggested'],
          description:
            'Q3 — "fixed" if the user named the date, "suggested" if they accepted one you proposed.',
        },
        ready_today: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['master', 'artwork', 'visualizer', 'distributor', 'none'],
          },
          description:
            'Q4 — what is already done. "none" means nothing is ready and cannot be combined with the others.',
        },
        goal: {
          type: 'string',
          enum: ['new_listeners', 'playlist_adds', 'press', 'fan_moment', 'catalog'],
          description: 'Q5 — what matters most this time.',
        },
        goal_text: { type: 'string', description: 'Q5 — anything they added in their own words.' },
        budget: {
          type: 'string',
          enum: ['none', 'under_100k', '100k_500k', 'over_500k'],
          description: 'Q6 — promo budget in naira.',
        },
        exclusions: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['marketing', 'press', 'paid_ads', 'events', 'physical'],
          },
          description:
            'Q7 — kinds of work to leave out entirely, only when the user plainly asked for it. Never suggest one yourself. Release day and getting it to stores stay in the plan either way.',
        },
        extra_notes: {
          type: 'string',
          description:
            'Q7 — anything else worth knowing. Read as instructions: something ruled out here becomes an excluded scope in the plan.',
        },
        preset: {
          type: 'string',
          enum: [...PLAN_PRESETS],
          description:
            'A whole plan shape, recognized from the user\'s own words BEFORE the interview — "quiet rollout", "low-key", "soft launch", "no noise" mean quiet; release day under 7 days away means surprise. When a preset is set, only artist_name, date_mode/release_date and ready_today matter — do not ask about goal or budget, and set goal to "catalog" and budget to "none". Omit for the ordinary full-interview plan.',
        },
      },
      required: ['release_type', 'artist_name', 'ready_today', 'goal', 'budget'],
    },
    execute: async (ctx, args) => {
      let releaseId = argString(args, 'releaseId');

      // Validate BEFORE any write: a bad answer must never orphan a release.
      const parsed = buildPlanIntake(args);
      if (!parsed.ok) {
        // Verbatim: the validator's message names the offending field, which
        // is what lets the model re-ask one question instead of all seven.
        return fail(`That answer doesn't work: ${parsed.error}`);
      }

      // No releaseId means the rollout is for a release that does not exist
      // yet — the usual case when the user asks UrgAns to create one. Create
      // it here, mirroring what PlannerIntakeModal does for the chip and note
      // entry points; without this the model can only target an EXISTING
      // release, which already has its activities and gets refused.
      let createdHere = false;
      if (!releaseId) {
        // Guard BEFORE creating: with the flag off the plan route 404s, so
        // creating first would strand a release with nothing able to plan it.
        if (!isReleasePlannerEnabled()) return fail(PLANNER_OFF);

        const created = await callInternalApi(ctx, '/api/releases', {
          method: 'POST',
          body: {
            title: argString(args, 'title') || undefined,
            releaseDate: parsed.intake.release_date ?? undefined,
            releaseType: parsed.intake.release_type,
            source: 'chappi',
          },
        });
        if (!created.ok) return fail(apiError(created, 'Could not create the rollout.'));
        releaseId = String(created.body.releaseId || '');
        if (!releaseId) return fail('Could not create the rollout.');
        createdHere = true;
      }

      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/plan`, {
        method: 'POST',
        body: { intake: parsed.intake },
      });
      if (isFlagGateOff(res)) return fail(PLANNER_OFF);
      if (!res.ok) {
        if (res.body.code === 'missing_release_date') {
          return fail(
            'This rollout has no release date yet, and the plan needs one. Ask for a date, then call this again with release_date filled in.'
          );
        }
        if (res.body.code === 'tasks_exist') {
          return fail(
            'This rollout already has its plan, so it cannot be re-planned. To plan a NEW rollout, call generate_release_plan again without a releaseId.'
          );
        }
        if (res.body.code === 'plan_in_progress') {
          return fail(
            'UrgAns is already building a plan for this rollout. Wait a moment, then check with get_release_plan.'
          );
        }
        if (res.body.code === 'tailoring_unavailable') {
          return fail(
            'UrgAns could not read the typed notes just now, so nothing was created. Offer to try again with the same answers.'
          );
        }
        if (createdHere) {
          // The release exists now even though the plan does not. Hand the
          // id back so the retry targets it instead of minting a duplicate.
          return {
            ok: false,
            summary: `The rollout was created, and it exists now, but the plan could not be built: ${apiError(res, 'Could not build the plan.')} Retry by calling generate_release_plan again WITH releaseId ${releaseId}; do not create another rollout.`,
            data: { releaseId },
          };
        }
        return fail(apiError(res, 'Could not build the plan.'));
      }

      const plan = (res.body.plan ?? {}) as Record<string, unknown>;
      const tasksCreated = Number(plan.tasksCreated ?? 0);
      const removed = Array.isArray(plan.removed) ? plan.removed : [];
      const appliedExclusions = Array.isArray(plan.appliedExclusions) ? plan.appliedExclusions : [];
      const warnings = Array.isArray(plan.warnings) ? (plan.warnings as string[]) : [];

      // Logged as ALREADY APPLIED, with no prior drafted row: the write above
      // IS the build, so there was never a draft to settle later. Fire after
      // the plan exists, never before — a run that failed is not a run the
      // console should count.
      await recordChatActionRun(ctx.adminClient, {
        actionType: PLAN_ACTION,
        objectId: releaseId,
        actor: ctx.user,
        status: 'applied',
        inputSummary: { intakeSource: 'chat', releaseType: parsed.intake.release_type },
        output: { tasksCreated, tasksRemoved: removed.length },
      });

      const labels = scopeLabels(appliedExclusions);
      const presetLine = parsed.intake.preset
        ? ` It's a ${PLAN_PRESET_LABELS[parsed.intake.preset]}.`
        : '';
      const leftOutLine = labels.length
        ? ` Left out: ${labels.join(', ')}.`
        : removed.length > 0
          ? ` ${removed.length} ${removed.length === 1 ? 'activity was' : 'activities were'} left out.`
          : '';
      const worthALookLine = warnings.length ? ` Worth a look: ${warnings.join(' ')}` : '';
      const fullBreakdownLine =
        labels.length || removed.length ? ' See the rollout for the full breakdown of what was left out and why.' : '';

      return {
        ok: true,
        summary: `${createdHere ? 'Created the rollout and built' : 'Built'} ${tasksCreated} activities.${presetLine}${leftOutLine}${worthALookLine}${fullBreakdownLine}`,
        data: {
          releaseId,
          tasksCreated,
          tasksRemoved: removed.length,
          exclusionsCount: appliedExclusions.length,
        },
        clientAction: { type: 'navigate', href: `/dashboard?release=${releaseId}` },
      };
    },
  },
];
