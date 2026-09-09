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
//   lets the model invent tasks; generate applies a validated delta to a
//   deterministic draft, exactly as the modal does.
//
// Approval is confirmation-gated: it writes ~60 real task rows in one batch and
// cannot be undone from the assistant.
//
// THESE THREE TOOLS ARE THE CHAT DOOR ONTO release.draft_plan, the embedded
// action a button inside the release runs. They reach the same draft through
// the same legacy /plan/* routes the review scene uses, so they need none of
// the action runner — but they DO log to urgans_actions, or /admin/urgans
// would be blind to half the drafting that happens. The gate is deliberately
// not shared: see lib/urgans-actions/chat-log-server.ts, which argues that.
// Every log call is fire-and-forget after the tool's own success, so a failed
// generate logs nothing and a failed log never costs the user their answer.

import {
  isReleasePlannerEnabled,
  parseReleasePlanIntake,
  type ReleasePlanIntake,
} from '@/lib/release-planning';
import {
  markChatActionApplied,
  markChatActionDiscarded,
  recordChatActionRun,
} from '@/lib/urgans-actions/chat-log-server';
import { findLatestDraftedActionId } from '@/lib/urgans-actions/server';
import {
  apiError,
  argString,
  callInternalApi,
  fail,
  isFlagGateOff,
  type ChappiTool,
} from './shared';

const PLANNER_OFF = "The rollout planner isn't enabled yet.";

/** The embedded action these three tools are the chat door onto. */
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
  if (typeof args.extra_notes === 'string' && args.extra_notes.trim()) {
    candidate.extra_notes = args.extra_notes.trim();
  }
  return parseReleasePlanIntake(candidate);
}

/** Per-phase counts instead of the whole document: a draft is ~60 tasks and
 * dumping it would crowd out the conversation it is supposed to support. */
function summarizeDraft(doc: Record<string, unknown>) {
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

export const PLANNER_TOOLS: ChappiTool[] = [
  {
    name: 'get_release_plan',
    kind: 'read',
    description:
      "Check whether a rollout has a plan yet: whether a draft is waiting, whether it has been approved, and how many activities sit in each phase. Returns a summary, not the full plan.",
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

      const draft = res.body.draft as Record<string, unknown> | null;
      const releaseDate = (res.body.releaseDate ?? null) as string | null;
      if (!draft) {
        return {
          ok: true,
          summary: releaseDate
            ? 'No rollout plan yet. Run the intake questions and generate one.'
            : 'No plan yet, and the rollout has no date — set one before approving any plan.',
          data: { hasDraft: false, approved: false, releaseDate },
        };
      }

      const doc = (draft.doc ?? {}) as Record<string, unknown>;
      const summary = summarizeDraft(doc);
      const approved = draft.status === 'approved';
      return {
        ok: true,
        summary: approved
          ? `The plan is approved: ${summary.totalTasks} activities.`
          : `A draft plan is waiting for approval: ${summary.totalTasks} activities.`,
        data: { hasDraft: true, approved, releaseDate, ...summary },
      };
    },
  },
  {
    name: 'generate_release_plan',
    kind: 'mutate',
    description:
      "Build a draft rollout plan from the hand-crafted playbook, tailored to the seven intake answers. Collect all seven in conversation first and read them back before calling this. Omit releaseId to create the rollout and draft its plan in one call — the usual case for a brand-new rollout. It does NOT create any activities — the plan stays a draft until it is approved.",
    inputSchema: {
      type: 'object',
      properties: {
        releaseId: {
          type: 'string',
          description:
            'Only for an existing rollout that has no activities yet. Omit to create the rollout and draft its plan in one call.',
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
        extra_notes: { type: 'string', description: 'Q7 — anything else worth knowing.' },
        replace: {
          type: 'boolean',
          description:
            'Only true when a draft already exists AND the user agreed to discard it and start over.',
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
        // Guard BEFORE creating: with the flag off the plan routes 404, so
        // creating first would strand a release — and worse, the create route
        // would instantiate the full template plan.
        if (!isReleasePlannerEnabled()) return fail(PLANNER_OFF);

        // `plan` is deliberately omitted (default 'template'), NOT the
        // modal's 'blank': with the planner on that means plannerPending —
        // no tasks, plus the planner_pending marker — so if the generate
        // below fails, the workspace still routes the manager into the
        // planner instead of leaving a bare unexplained release. The flag
        // guard above is what makes the default safe.
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

      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/plan/generate`, {
        method: 'POST',
        body: { intake: parsed.intake, replace: args.replace === true },
      });
      if (isFlagGateOff(res)) return fail(PLANNER_OFF);
      if (!res.ok) {
        if (res.body.code === 'draft_exists') {
          return fail(
            'There is already a draft plan for this rollout. Ask whether to start over before generating again.'
          );
        }
        if (res.body.code === 'tasks_exist') {
          return fail(
            'This rollout already has its activities, so it cannot be re-planned. To plan a NEW rollout, call generate_release_plan again without a releaseId.'
          );
        }
        if (createdHere) {
          // The release exists now even though the draft does not. Hand the
          // id back so the retry targets it instead of minting a duplicate.
          return {
            ok: false,
            summary: `The rollout was created — it exists now — but the plan could not be drafted: ${apiError(res, 'Could not build the plan.')} Retry by calling generate_release_plan again WITH releaseId ${releaseId}; do not create another rollout.`,
            data: { releaseId },
          };
        }
        return fail(apiError(res, 'Could not build the plan.'));
      }

      const draft = (res.body.draft ?? {}) as Record<string, unknown>;
      const doc = (draft.doc ?? {}) as Record<string, unknown>;
      const summary = summarizeDraft(doc);

      // Logged after the draft exists, never before: a run that failed is not
      // a run the console should count.
      await recordChatActionRun(ctx.adminClient, {
        actionType: PLAN_ACTION,
        objectId: releaseId,
        actor: ctx.user,
        inputSummary: { intakeSource: 'chat', releaseType: parsed.intake.release_type },
        output: { totalTasks: summary.totalTasks, phases: summary.phases },
      });
      const phaseLine = summary.phases
        .map((entry) => `${entry.phase}: ${entry.tasks}`)
        .join(', ');
      return {
        ok: true,
        summary: `${createdHere ? 'Created the rollout and drafted' : 'Drafted'} ${summary.totalTasks} activities (${phaseLine}). Nothing is scheduled yet — it needs approving.`,
        data: { releaseId, ...summary },
        // Open the review scene so they can read the plan before approving.
        clientAction: { type: 'navigate', href: `/dashboard?release=${releaseId}&scene=plan` },
      };
    },
  },
  {
    name: 'approve_release_plan',
    kind: 'mutate',
    description:
      'Turn the draft plan into real activities on the rollout. Requires the user to approve a confirmation card — calling this only proposes it. Cannot be undone from here.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    confirm: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return { ok: false, summary: 'releaseId is required.' };

      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/plan`, { method: 'GET' });
      if (isFlagGateOff(res)) return { ok: false, summary: PLANNER_OFF };
      if (!res.ok) return { ok: false, summary: apiError(res, 'Could not load the plan.') };

      const draft = res.body.draft as Record<string, unknown> | null;
      if (!draft) {
        return { ok: false, summary: 'There is no draft plan to approve yet.' };
      }
      if (draft.status === 'approved') {
        return { ok: false, summary: 'That plan has already been approved.' };
      }
      // Approval needs a date to hang every offset off — say so here rather
      // than letting the user approve into a 400.
      const releaseDate = (res.body.releaseDate ?? null) as string | null;
      if (!releaseDate) {
        return {
          ok: false,
          summary:
            'This rollout has no date yet, and the plan needs one. Set the date with schedule_release first.',
        };
      }

      const summary = summarizeDraft((draft.doc ?? {}) as Record<string, unknown>);
      return {
        ok: true,
        title: `Approve this plan and create ${summary.totalTasks} activities?`,
        detail: `They will be scheduled around ${releaseDate} and appear on the rollout straight away. Undoing this means deleting the activities one by one.`,
        confirmLabel: 'Approve plan',
      };
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/plan/approve`, {
        method: 'POST',
        body: {},
      });
      if (isFlagGateOff(res)) return fail(PLANNER_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not approve the plan.'));

      const created = Number(res.body.tasksCreated ?? 0);

      // Settle whichever run drafted this plan, whichever door it came
      // through. findLatestDraftedActionId is the same lookup the review
      // scene uses, and re-deriving it here rather than threading an id
      // through the conversation is deliberate: a plan drafted from the
      // button and approved in chat is a real sequence, and the transcript
      // would know nothing about that run.
      await markChatActionApplied(
        ctx.adminClient,
        await findLatestDraftedActionId(ctx.adminClient, {
          objectType: 'release',
          objectId: releaseId,
          actionType: PLAN_ACTION,
        }),
        { tasksCreated: created }
      );

      const warnings = Array.isArray(res.body.warnings) ? (res.body.warnings as string[]) : [];
      const warningLine = warnings.length ? ` Note: ${warnings.join(' ')}` : '';
      return {
        ok: true,
        summary: `Created ${created} activities from the plan.${warningLine}`,
        clientAction: { type: 'navigate', href: `/dashboard?release=${releaseId}` },
      };
    },
  },
  {
    name: 'discard_release_plan',
    kind: 'mutate',
    description:
      'Throw away the draft rollout plan so a new one can be built. Requires the user to approve a confirmation card. Approved plans cannot be discarded.',
    inputSchema: {
      type: 'object',
      properties: { releaseId: { type: 'string' } },
      required: ['releaseId'],
    },
    confirm: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return { ok: false, summary: 'releaseId is required.' };

      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/plan`, { method: 'GET' });
      if (isFlagGateOff(res)) return { ok: false, summary: PLANNER_OFF };
      const draft = res.ok ? (res.body.draft as Record<string, unknown> | null) : null;
      if (!draft) return { ok: false, summary: 'There is no draft plan to discard.' };
      if (draft.status === 'approved') {
        return {
          ok: false,
          summary: 'That plan is already approved, so it cannot be discarded.',
        };
      }

      const summary = summarizeDraft((draft.doc ?? {}) as Record<string, unknown>);
      return {
        ok: true,
        title: 'Discard this draft plan?',
        detail: `The ${summary.totalTasks} drafted activities and any edits made to them will be lost. No activities have been created yet, so nothing on the rollout changes.`,
        confirmLabel: 'Discard draft',
      };
    },
    execute: async (ctx, args) => {
      const releaseId = argString(args, 'releaseId');
      if (!releaseId) return fail('releaseId is required.');
      const res = await callInternalApi(ctx, `/api/releases/${releaseId}/plan`, { method: 'DELETE' });
      if (isFlagGateOff(res)) return fail(PLANNER_OFF);
      if (!res.ok) return fail(apiError(res, 'Could not discard the draft.'));

      await markChatActionDiscarded(
        ctx.adminClient,
        await findLatestDraftedActionId(ctx.adminClient, {
          objectType: 'release',
          objectId: releaseId,
          actionType: PLAN_ACTION,
        })
      );

      return { ok: true, summary: 'Discarded the draft plan.' };
    },
  },
];
