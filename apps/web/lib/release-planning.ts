/**
 * Shared types, validation, and prompt construction for the UrgAns release
 * planner. Client-safe (no node imports) so the intake wizard and the
 * workspace import the option constants, labels and pure date math while the
 * API routes import the parsers, validators and prompt builders.
 *
 * ## The shape of this feature
 *
 * The planner never asks a model for a plan. It builds a deterministic draft
 * from the hand-crafted template first, removes whatever the manager's answers
 * rule out (a SCOPE, applied by code — see PLAN_SCOPES), then asks for a DELTA
 * against what is left: drop tasks, shift offsets, map role archetypes to real
 * people, rewrite a few "why this matters" lines. Every id in that delta must
 * be one we supplied, and the whole response is rejected if any of it is not.
 *
 * The model cannot add tasks. That is deliberate: a task with no template
 * origin is exactly the "AI invents tasks from scratch" failure mode CLAUDE.md
 * forbids, and there would be nothing to validate it against. The manager adds
 * anything missing by hand once the plan has landed on the rollout.
 *
 * With no model configured the deterministic draft, minus the scopes the
 * answers ruled out, IS the plan — which is what makes the whole flow work
 * with AI switched off and still follow the answers.
 *
 * This module supersedes lib/release-tailoring.ts (Phase 5), whose route
 * applied model output straight onto real task rows.
 *
 * @see CLAUDE.md "Hand-crafted release templates" and the "templates carry
 *   domain knowledge, AI is a removable polish layer" principle.
 */

import type { Template, TaskRole } from './release-templates/types';
import type { ProposedOwner } from './task-owners';

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * The planner stays dark until NEXT_PUBLIC_FEATURE_RELEASE_PLANNER is 'true'.
 *
 * Lives here rather than being retyped in each caller because both halves of
 * the feature need it: the API routes 404 when it is off, and release creation
 * only skips task instantiation when it is on. The NEXT_PUBLIC_ prefix means
 * the value is inlined at build time, so client components still hoist their
 * own module-scope const to keep the modal out of the bundle when it is off.
 */
export const isReleasePlannerEnabled = (): boolean =>
  process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

/**
 * Release types the planner offers. Deliberately NOT the template module's
 * ReleaseType: 'music_video' has no template and is not a value the
 * `release_type` database enum accepts.
 *
 * EP and album record their real type but are planned from the single
 * playbook, which is the only template authored so far. The intake says so in
 * plain words rather than pretending there is a dedicated one.
 */
export type PlanReleaseType = 'single' | 'ep' | 'album';

/** What the manager already has in hand. 'none' is exclusive of the others. */
export type ReadyItem = 'master' | 'artwork' | 'visualizer' | 'distributor' | 'none';

/**
 * What matters most this time. Every value is a radio choice in the intake
 * modal and an enum the chat interview normalizes to. There is deliberately
 * no "unknown": a plan is only ever built from answered questions, so the
 * guidance the model gets is keyed on a real answer every time.
 */
export type PlanGoal = 'new_listeners' | 'playlist_adds' | 'press' | 'fan_moment' | 'catalog';

/** Rollout budget in naira. Display labels live in BUDGET_OPTIONS. */
export type PlanBudget = 'none' | 'under_100k' | '100k_500k' | 'over_500k';

/**
 * The seven intake answers.
 *
 * `version: 2` is a discriminator, not decoration. `releases.release_context`
 * previously held the Phase 5 tailoring shape (artist_scale / marketing_budget
 * / distributor_type). Those rows parse to null here and are simply ignored —
 * there is no backfill, and the prefill just starts empty for them.
 */
export type ReleasePlanIntake = {
  version: 2;
  /** Q1. */
  release_type: PlanReleaseType;
  /** Q2 — the artist this release is for, confirmed or corrected by the manager. */
  artist_name: string;
  /** Q3 — whether the date was typed or accepted from the planner's suggestion. */
  date_mode: 'fixed' | 'suggested';
  /** Q3 — YYYY-MM-DD. Null while still undecided; approval requires one. */
  release_date: string | null;
  /** Q4. */
  ready_today: ReadyItem[];
  /** Q5. */
  goal: PlanGoal;
  /** Q5 free text. */
  goal_text?: string;
  /** Q6. */
  budget: PlanBudget;
  /** Q7 — the kinds of work to leave out entirely. Absent when nothing was
   *  ruled out; applied by code before any model is called, so they hold
   *  when the model is unavailable. See PLAN_SCOPES. */
  exclusions?: PlanScope[];
  /** Q7 — free text, prefilled from a note when the flow starts from one.
   *  Read by the model as instructions: "no listening party" here becomes an
   *  excluded scope in its delta. */
  extra_notes?: string;
};

export const RELEASE_TYPE_OPTIONS: Array<{ value: PlanReleaseType; label: string }> = [
  { value: 'single', label: 'Single' },
  { value: 'ep', label: 'EP' },
  { value: 'album', label: 'Album' },
];

export const READY_TODAY_OPTIONS: Array<{ value: ReadyItem; label: string }> = [
  { value: 'master', label: 'The music is mixed and mastered' },
  { value: 'artwork', label: 'Cover art is ready' },
  { value: 'visualizer', label: 'A video or visualizer is ready' },
  { value: 'distributor', label: 'The distributor is set up' },
  { value: 'none', label: 'None of it yet' },
];

export const GOAL_OPTIONS: Array<{ value: PlanGoal; label: string }> = [
  { value: 'new_listeners', label: 'Reach new listeners' },
  { value: 'playlist_adds', label: 'Land playlist adds' },
  { value: 'press', label: 'Get press coverage' },
  { value: 'fan_moment', label: 'Give current fans a moment' },
  { value: 'catalog', label: 'Build the catalog quietly' },
];

export const BUDGET_OPTIONS: Array<{ value: PlanBudget; label: string }> = [
  { value: 'none', label: 'No budget' },
  { value: 'under_100k', label: 'Under ₦100k' },
  { value: '100k_500k', label: '₦100k to ₦500k' },
  { value: 'over_500k', label: 'Over ₦500k' },
];

// ---------------------------------------------------------------------------
// Scopes: the kinds of work a manager can leave out
// ---------------------------------------------------------------------------

/**
 * What makes "a normal release, no marketing" buildable.
 *
 * The delta contract below still forbids the model from dropping a required
 * task on its own judgement (37 of the single playbook's 64 tasks are tagged
 * marketing and 27 of those are required, so no delta could ever honour that
 * request). Removing a whole kind of work is therefore a SCOPE: a name mapped
 * to one of the playbooks' own tags and applied by code. The manager picks
 * scopes as chips on the last question; the model's only part is translating
 * free text ("no listening party") into a scope name it returns in
 * `exclude_scopes`, and the product does the removal either way.
 */
export const PLAN_SCOPES = ['marketing', 'press', 'paid_ads', 'events', 'physical'] as const;
export type PlanScope = (typeof PLAN_SCOPES)[number];

export const PLAN_SCOPE_OPTIONS: Array<{ value: PlanScope; label: string; covers: string }> = [
  {
    value: 'marketing',
    label: 'Marketing and promo',
    covers: 'promotion, content, social posts and announcements',
  },
  {
    value: 'press',
    label: 'Playlist pitching and press',
    covers: 'playlist pitching, editorial submissions and press outreach',
  },
  { value: 'paid_ads', label: 'Paid ads', covers: 'paid promotion and ad spend' },
  { value: 'events', label: 'Live events', covers: 'listening parties and other live moments' },
  { value: 'physical', label: 'Physical formats', covers: 'vinyl, CD and cassette' },
];

export const PLAN_SCOPE_LABELS = Object.fromEntries(
  PLAN_SCOPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<PlanScope, string>;

/**
 * The playbook tag each scope removes. `paid` and `physical` were added to
 * the playbooks for exactly this (the ads steps and the pressing step); the
 * other three reuse tags the templates have always carried.
 */
export const SCOPE_TAGS: Record<PlanScope, string> = {
  marketing: 'marketing',
  press: 'editorial',
  paid_ads: 'paid',
  events: 'event',
  physical: 'physical',
};

/**
 * Tags no scope may remove. Release day itself and the distributor handoff
 * ARE the release: a rollout with no marketing still goes live and still has
 * to reach the stores. A task carrying either tag survives every scope,
 * whatever else it is tagged — the release-day announcement post is tagged
 * marketing and stays.
 */
export const KEEP_TAGS = ['release_day', 'distribution'] as const;

export const isPlanScope = (value: unknown): value is PlanScope =>
  typeof value === 'string' && (PLAN_SCOPES as readonly string[]).includes(value);

/** Whether a scope removes this task: it carries the scope's tag and no keep tag. */
export function isTaskInScope(task: { tags: string[] }, scope: PlanScope): boolean {
  if (!task.tags.includes(SCOPE_TAGS[scope])) return false;
  return !task.tags.some((tag) => (KEEP_TAGS as readonly string[]).includes(tag));
}

const RELEASE_TYPES = RELEASE_TYPE_OPTIONS.map((o) => o.value);
const READY_ITEMS = READY_TODAY_OPTIONS.map((o) => o.value);
const GOALS = GOAL_OPTIONS.map((o) => o.value);
const BUDGETS = BUDGET_OPTIONS.map((o) => o.value);

export const MAX_ARTIST_NAME_LENGTH = 120;
export const MAX_GOAL_TEXT_LENGTH = 300;
export const MAX_EXTRA_NOTES_LENGTH = 2000;

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate and normalize intake answers from an untrusted source (a request
 * body, or a `release_context` column written by an older build). Free text is
 * trimmed and length-capped; 'none' wins over every other readiness answer.
 */
export function parseReleasePlanIntake(
  value: unknown
): { ok: true; intake: ReleasePlanIntake } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'intake must be an object.' };
  }
  const record = value as Record<string, unknown>;

  if (record.version !== 2) {
    return { ok: false, error: 'intake must be version 2.' };
  }
  if (!RELEASE_TYPES.includes(record.release_type as PlanReleaseType)) {
    return { ok: false, error: `release_type must be one of: ${RELEASE_TYPES.join(', ')}.` };
  }
  if (record.date_mode !== 'fixed' && record.date_mode !== 'suggested') {
    return { ok: false, error: 'date_mode must be "fixed" or "suggested".' };
  }
  if (!GOALS.includes(record.goal as PlanGoal)) {
    return { ok: false, error: `goal must be one of: ${GOALS.join(', ')}.` };
  }
  if (!BUDGETS.includes(record.budget as PlanBudget)) {
    return { ok: false, error: `budget must be one of: ${BUDGETS.join(', ')}.` };
  }

  const artistName = typeof record.artist_name === 'string' ? record.artist_name.trim() : '';
  if (!artistName) {
    return { ok: false, error: 'artist_name is required.' };
  }

  let releaseDate: string | null = null;
  if (typeof record.release_date === 'string' && record.release_date.trim()) {
    const candidate = record.release_date.trim();
    if (!YMD_PATTERN.test(candidate) || parseYmd(candidate) === null) {
      return { ok: false, error: 'release_date must be a date in YYYY-MM-DD form.' };
    }
    releaseDate = candidate;
  } else if (record.release_date != null) {
    return { ok: false, error: 'release_date must be a date in YYYY-MM-DD form, or null.' };
  }

  if (!Array.isArray(record.ready_today)) {
    return { ok: false, error: 'ready_today must be an array.' };
  }
  const readySet = new Set<ReadyItem>();
  for (const entry of record.ready_today) {
    if (typeof entry !== 'string' || !READY_ITEMS.includes(entry as ReadyItem)) {
      return { ok: false, error: `ready_today may only contain: ${READY_ITEMS.join(', ')}.` };
    }
    readySet.add(entry as ReadyItem);
  }
  // "None of it yet" is an answer about everything else, so it cannot coexist
  // with a specific item. Normalizing here means no caller has to remember.
  const readyToday: ReadyItem[] = readySet.has('none')
    ? ['none']
    : READY_ITEMS.filter((item) => readySet.has(item));

  const intake: ReleasePlanIntake = {
    version: 2,
    release_type: record.release_type as PlanReleaseType,
    artist_name: artistName.slice(0, MAX_ARTIST_NAME_LENGTH),
    date_mode: record.date_mode,
    release_date: releaseDate,
    ready_today: readyToday,
    goal: record.goal as PlanGoal,
    budget: record.budget as PlanBudget,
  };

  if (typeof record.goal_text === 'string' && record.goal_text.trim()) {
    intake.goal_text = record.goal_text.trim().slice(0, MAX_GOAL_TEXT_LENGTH);
  }
  if (typeof record.extra_notes === 'string' && record.extra_notes.trim()) {
    intake.extra_notes = record.extra_notes.trim().slice(0, MAX_EXTRA_NOTES_LENGTH);
  }
  if (record.exclusions !== undefined) {
    const scopeList = `exclusions may only contain: ${PLAN_SCOPES.join(', ')}.`;
    if (!Array.isArray(record.exclusions)) {
      return { ok: false, error: scopeList };
    }
    const chosen = new Set<PlanScope>();
    for (const entry of record.exclusions) {
      if (!isPlanScope(entry)) return { ok: false, error: scopeList };
      chosen.add(entry);
    }
    // Stored in scope order and only when something was chosen, so an intake
    // with nothing ruled out is byte-identical to one written before this
    // field existed.
    if (chosen.size > 0) {
      intake.exclusions = PLAN_SCOPES.filter((scope) => chosen.has(scope));
    }
  }

  return { ok: true, intake };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD to a UTC epoch, or null when the string is not a real date. */
export function parseYmd(ymd: string): number | null {
  if (!YMD_PATTERN.test(ymd)) return null;
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  const day = Number(ymd.slice(8, 10));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const epoch = Date.UTC(year, month - 1, day);
  if (Number.isNaN(epoch)) return null;
  // Rejects the likes of 2026-02-31, which Date.UTC would happily roll over.
  const rolled = new Date(epoch);
  if (rolled.getUTCMonth() !== month - 1 || rolled.getUTCDate() !== day) return null;
  return epoch;
}

export function formatYmd(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

/** The date a task with this offset falls on, as YYYY-MM-DD. */
export function computeTaskYmd(releaseDate: string, offsetDays: number): string | null {
  const epoch = parseYmd(releaseDate);
  if (epoch === null) return null;
  return formatYmd(epoch + offsetDays * MS_PER_DAY);
}

/** The offset a task date implies. Inverse of {@link computeTaskYmd}. */
export function offsetFromTaskYmd(releaseDate: string, taskYmd: string): number | null {
  const releaseEpoch = parseYmd(releaseDate);
  const taskEpoch = parseYmd(taskYmd);
  if (releaseEpoch === null || taskEpoch === null) return null;
  return Math.round((taskEpoch - releaseEpoch) / MS_PER_DAY);
}

/**
 * Days of runway the planner assumes when nothing is ready yet. Matches
 * single_v0.3's earliest task (eight weeks out); callers that have the
 * template loaded should pass getTemplateLeadTimeDays(template) instead so the
 * suggestion tracks the template rather than this constant.
 */
export const DEFAULT_PLAN_LEAD_DAYS = 56;

/** Runway floor. Below three weeks the playbook stops being a rollout. */
const MIN_PLAN_LEAD_DAYS = 21;

const READY_RUNWAY_CREDIT: Record<ReadyItem, number> = {
  // Each finished asset removes the part of the runway that existed to produce
  // it. A locked master frees week 8, artwork frees the design pass, and a
  // live distributor account frees the whole upload-and-confirm stretch.
  master: 7,
  artwork: 7,
  distributor: 14,
  visualizer: 0,
  none: 0,
};

/**
 * The date UrgAns offers when the manager asks for help picking one: the first
 * Friday that still leaves enough runway for the work that is actually left.
 *
 * Deterministic on purpose. The intake presents it as the planner's
 * suggestion, and it keeps working with no model configured.
 */
export function suggestReleaseDate(
  todayYmd: string,
  ready: ReadyItem[],
  baseLeadDays: number = DEFAULT_PLAN_LEAD_DAYS
): string | null {
  const todayEpoch = parseYmd(todayYmd);
  if (todayEpoch === null) return null;

  const credited = ready.reduce((total, item) => total + (READY_RUNWAY_CREDIT[item] ?? 0), 0);
  const runway = Math.max(MIN_PLAN_LEAD_DAYS, baseLeadDays - credited);

  const earliest = todayEpoch + runway * MS_PER_DAY;
  // Releases land on Fridays, so snap forward to the next one (staying put if
  // the earliest date already is a Friday).
  const weekday = new Date(earliest).getUTCDay();
  const daysToFriday = (5 - weekday + 7) % 7;
  return formatYmd(earliest + daysToFriday * MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type PlanPhase = 'setup' | 'pre_release' | 'release_week' | 'post_release';

export const PLAN_PHASE_ORDER: PlanPhase[] = [
  'setup',
  'pre_release',
  'release_week',
  'post_release',
];

export const PLAN_PHASE_LABELS: Record<PlanPhase, string> = {
  setup: 'Setup',
  pre_release: 'Pre-release',
  release_week: 'Release week',
  post_release: 'Post-release',
};

export const PLAN_PHASE_BLURBS: Record<PlanPhase, string> = {
  setup: 'Weeks out. Lock the music, the art and the paperwork.',
  pre_release: 'The marketing ramp and final prep.',
  release_week: 'Release day and the days around it.',
  post_release: 'Keeping it alive after release day.',
};

/**
 * Which phase a task belongs to, from its offset alone.
 *
 * Templates carry no phase field: single_v0.3 marks its weeks with comment
 * banners, and only `tags` are machine readable. These boundaries line up with
 * those banners, so the four groups the plan summary and the timeline show are
 * the same weeks the playbook was written in. Any stored phase is recomputed
 * through here, so this is the only definition.
 */
export function derivePlanPhase(offsetDays: number): PlanPhase {
  if (offsetDays <= -29) return 'setup';
  if (offsetDays <= -8) return 'pre_release';
  if (offsetDays <= 7) return 'release_week';
  return 'post_release';
}

// ---------------------------------------------------------------------------
// The draft document
// ---------------------------------------------------------------------------

/**
 * 2 since exclusions: the document gained `applied_exclusions` and
 * `removed_by` gained 'intake'. parseDraftDoc still reads a version 1
 * document (an approved plan from before this) as version 2 with nothing
 * applied, so the plan summary keeps working for every rollout already
 * planned.
 */
export const PLAN_DRAFT_SCHEMA_VERSION = 2;

export const MAX_DRAFT_TASKS = 200;
export const MAX_DRAFT_TITLE_LENGTH = 140;
export const MAX_DRAFT_WHY_LENGTH = 600;
/** What the model may write. Shorter than a manager's own edit on purpose. */
export const MAX_AI_WHY_LENGTH = 160;
export const MAX_RATIONALE_LENGTH = 600;
/** A drop is a bigger claim than a reword, but it is still a one-liner shown
 *  next to the activity it removed, not a paragraph. The same budget covers
 *  the reason on an excluded scope. */
export const MAX_DROP_REASON_LENGTH = 160;
/** A schedule/assumption note for the manager, not data that reaches a task
 *  row — same length budget as a rewrite for the same reason. */
export const MAX_WARNING_LENGTH = 160;
/** However many things are worth flagging, five is the most a manager will
 *  actually read before approving. Enforced by truncation, not rejection: a
 *  sixth warning is a reason to trim the list, never to throw away an
 *  otherwise-good delta. */
export const MAX_DELTA_WARNINGS = 5;

const MIN_TASK_OFFSET = -120;
const MAX_TASK_OFFSET = 60;

export type DraftTaskOrigin = 'template' | 'user';

export type DraftTask = {
  /**
   * Stable id within the draft. Template tasks reuse the template task id;
   * tasks the manager adds get a `user_` prefixed one. Real task UUIDs are
   * minted at approval, never here.
   */
  id: string;
  /** Provenance back to the template. Null for tasks the manager added. */
  template_task_id: string | null;
  origin: DraftTaskOrigin;
  title: string;
  /**
   * The one-line "why this matters". Defaults to the template's hand-written
   * description and becomes `tasks.description` on approval, so the template's
   * words are what ship unless something in the context changed them.
   */
  why: string;
  phase: PlanPhase;
  /**
   * Days relative to release day. Canonical: absolute dates are always
   * computed from the release's current date, so moving the release date
   * re-flows the whole plan instead of stranding it.
   */
  offset_days: number;
  duration_days: number;
  role: TaskRole | null;
  assignee_user_id: string | null;
  optional: boolean;
  task_type: 'task' | 'event_milestone';
  tags: string[];
  /** Ids of other draft tasks. Translated to real UUIDs at approval. */
  depends_on: string[];
  /** Soft removal: a removed task never becomes a row, and the reason it went
   *  is what the plan summary shows the manager. */
  removed: boolean;
  /** 'intake' — a scope the manager's own answers ruled out (a chip, or the
   *  "no budget" answer), applied by code before any model ran. 'ai' — the
   *  model dropped it, or excluded the scope it sits in. 'user' — a manager
   *  removed the row by hand in the review scene this document used to be
   *  edited in; still readable from older documents. */
  removed_by: 'ai' | 'user' | 'intake' | null;
  /** The one-line reason this task went, shown beside it in the plan
   *  summary. Null when removed_by is 'user' (a manager removing their own
   *  row needs no explanation) or when the task has never been dropped.
   *  Required by validatePlannerDelta whenever the model drops something. */
  removed_reason: string | null;
  /** UrgAns's one-line reason for moving this task's date. Optional even
   *  from the model — a small date shift often needs no explanation — so
   *  this stays null far more often than removed_reason does. */
  change_reason: string | null;
  /** Where the current assignee came from, for the small provenance label
   *  next to the picker: 'history' (proposeTaskOwners found a past
   *  assignee for this exact template step), 'role' (proposeTaskOwners
   *  matched the role archetype instead), 'ai' (the model's own
   *  role_assignments delta set it), 'user' (the manager picked someone by
   *  hand), or null (still the plain owner default, nothing to explain).
   *  'history' is the one basis applyDeltaToDraft will never overwrite —
   *  see that function's own comment. */
  assignee_basis: 'history' | 'role' | 'ai' | 'user' | null;
  /** The manager touched this row in the review scene this document used to
   *  be edited in. Still readable from older documents; the model never
   *  touches such a row. */
  edited: boolean;
};

/**
 * Why a draft has no tailoring on it. `not_configured` means no model is
 * wired at all, which is a normal state rather than an error; the rest are
 * one-off failures the manager can retry.
 */
export type PlanDraftFailure =
  | 'not_configured'
  | 'timeout'
  | 'busy'
  | 'invalid_output'
  | 'unavailable';

export const PLAN_DRAFT_FAILURES: PlanDraftFailure[] = [
  'not_configured',
  'timeout',
  'busy',
  'invalid_output',
  'unavailable',
];

export type PlanDraftAiState = {
  applied: boolean;
  rationale: string | null;
  failure: PlanDraftFailure | null;
  /** Optional so every existing `{ applied, rationale, failure }` literal in
   *  this codebase keeps compiling unchanged. Absent means the same thing as
   *  empty — read via `doc.ai.warnings ?? []`, never assume the key exists. */
  warnings?: string[];
};

/** One kind of work left out of the plan, and who asked for it. */
export type AppliedExclusion = {
  scope: PlanScope;
  /** 'intake' — a chip on the last question. 'budget' — the "no budget"
   *  answer, which rules out paid ads on its own. 'ai' — the model read it in
   *  the manager's notes and returned it in `exclude_scopes`. */
  by: 'intake' | 'budget' | 'ai';
  reason: string;
};

export type ReleasePlanDraftDoc = {
  schema_version: 2;
  template_id: string;
  template_version: string;
  release_type: PlanReleaseType;
  generated_at: string;
  /** The release date the draft was generated against, for the moved-date notice. */
  generated_for_release_date: string | null;
  intake: ReleasePlanIntake;
  ai: PlanDraftAiState;
  /** Every scope removed from this plan, in the order it was applied. One
   *  entry per scope: the first request for a scope wins, so a chip the
   *  manager ticked is never re-attributed to the model. */
  applied_exclusions: AppliedExclusion[];
  tasks: DraftTask[];
};

/** A saved plan document, as read back from `release_plan_drafts`. */
export type ReleasePlanDraft = {
  id: string;
  status: 'draft' | 'approved';
  doc: ReleasePlanDraftDoc;
  updatedAt: string;
  approvedAt: string | null;
};

export type RemovedTaskSummary = {
  id: string;
  title: string;
  reason: string | null;
  by: 'ai' | 'intake';
};

/**
 * What the manager is told was left out: every task a scope or the model
 * removed, with its reason. Rows removed by hand in an older document
 * (`removed_by: 'user'`) are skipped — the manager did that themselves and
 * there is no reason to report back to them.
 *
 * Pure and here rather than in the server module because the plan summary
 * the manager reads after a build (PlanBuiltBanner) derives the same list in
 * the browser from the stored document, and two derivations would drift.
 */
export function summarizeRemovedTasks(doc: ReleasePlanDraftDoc): RemovedTaskSummary[] {
  const removed: RemovedTaskSummary[] = [];
  for (const task of doc.tasks) {
    if (!task.removed) continue;
    if (task.removed_by !== 'ai' && task.removed_by !== 'intake') continue;
    removed.push({ id: task.id, title: task.title, reason: task.removed_reason, by: task.removed_by });
  }
  return removed;
}

/**
 * What a build hands back: the shape `POST /api/releases/[id]/plan` answers
 * with and the embedded action's output. Defined beside the document types
 * rather than in the server module so the browser (lib/urgans-actions/client,
 * the planner store) can name it without importing anything server-side.
 */
export type CreatedPlan = {
  tasksCreated: number;
  taskIds: string[];
  /** Everything worth a look: assignee fallbacks, the model's own warnings,
   *  a model failure the plan proceeded through, dates already behind today. */
  warnings: string[];
  removed: RemovedTaskSummary[];
  appliedExclusions: AppliedExclusion[];
  rationale: string | null;
  aiApplied: boolean;
  aiFailure: PlanDraftFailure | null;
  releaseDate: string;
};

/**
 * Build the deterministic draft: every template task, in template order, with
 * the template's own words as the why-line and the release owner holding
 * everything until someone is assigned.
 *
 * This is a complete, valid plan on its own. The model only ever adjusts it.
 */
export function buildDraftFromTemplate(params: {
  template: Template;
  intake: ReleasePlanIntake;
  ownerUserId: string;
  generatedAt: string;
}): ReleasePlanDraftDoc {
  const { template, intake, ownerUserId, generatedAt } = params;

  const tasks: DraftTask[] = template.tasks.map((task) => ({
    id: task.id,
    template_task_id: task.id,
    origin: 'template' as const,
    title: task.title,
    why: task.description,
    phase: derivePlanPhase(task.offset_days),
    offset_days: task.offset_days,
    duration_days: task.duration_days,
    role: task.role,
    assignee_user_id: ownerUserId,
    optional: task.optional,
    task_type: task.type,
    tags: task.tags ?? [],
    depends_on: [...(task.depends_on ?? [])],
    removed: false,
    removed_by: null,
    removed_reason: null,
    change_reason: null,
    assignee_basis: null,
    edited: false,
  }));

  return {
    schema_version: PLAN_DRAFT_SCHEMA_VERSION,
    template_id: template.id,
    template_version: template.version,
    release_type: intake.release_type,
    generated_at: generatedAt,
    generated_for_release_date: intake.release_date,
    intake,
    ai: { applied: false, rationale: null, failure: null, warnings: [] },
    applied_exclusions: [],
    tasks,
  };
}

// ---------------------------------------------------------------------------
// Scope exclusions
// ---------------------------------------------------------------------------

/** The reason stamped on a task a manager's own answer removed. */
export function exclusionReason(scope: PlanScope, by: 'intake' | 'budget'): string {
  if (by === 'budget') return 'No promo budget.';
  return `You asked to leave out ${PLAN_SCOPE_LABELS[scope].toLowerCase()}.`;
}

/**
 * The exclusions the answers themselves imply, before any model is called:
 * every chip on the last question, plus paid ads whenever the budget is
 * "none". Deterministic, so they hold when the model is unavailable — which
 * is what lets the plan follow the answers even then. A chip outranks the
 * budget inference when both name paid ads, so the reason reads as the
 * manager's own choice.
 */
export function deriveIntakeExclusions(intake: ReleasePlanIntake): AppliedExclusion[] {
  const entries: AppliedExclusion[] = [];
  for (const scope of intake.exclusions ?? []) {
    entries.push({ scope, by: 'intake', reason: exclusionReason(scope, 'intake') });
  }
  if (intake.budget === 'none' && !entries.some((entry) => entry.scope === 'paid_ads')) {
    entries.push({ scope: 'paid_ads', by: 'budget', reason: exclusionReason('paid_ads', 'budget') });
  }
  return entries;
}

/**
 * Soft-remove every template task inside each scope and record the scope on
 * the document. Three rules, each load-bearing:
 *
 *  - A scope is applied ONCE. A second entry for a scope already on the
 *    document is ignored, so a chip the manager ticked is never re-stamped
 *    as the model's idea, and applying an intake entry and then the model's
 *    identical one changes nothing.
 *  - A task carrying a keep tag survives (see {@link isTaskInScope}).
 *  - Rows the manager added, and rows already removed, are left exactly as
 *    they are. An unknown scope name is ignored rather than removing
 *    anything — the parser hands scopes through as strings, and the
 *    validator is what refuses one the module does not know.
 */
export function applyScopeExclusions(
  doc: ReleasePlanDraftDoc,
  entries: AppliedExclusion[]
): ReleasePlanDraftDoc {
  const seen = new Set(doc.applied_exclusions.map((entry) => entry.scope));
  const fresh: AppliedExclusion[] = [];
  for (const entry of entries) {
    if (!isPlanScope(entry.scope) || seen.has(entry.scope)) continue;
    seen.add(entry.scope);
    fresh.push({ scope: entry.scope, by: entry.by, reason: entry.reason });
  }
  if (fresh.length === 0) return doc;

  const tasks = doc.tasks.map((task) => {
    if (task.origin !== 'template' || task.removed) return task;
    const hit = fresh.find((entry) => isTaskInScope(task, entry.scope));
    if (!hit) return task;
    return {
      ...task,
      removed: true,
      removed_by: hit.by === 'ai' ? ('ai' as const) : ('intake' as const),
      removed_reason: hit.reason,
    };
  });

  return { ...doc, applied_exclusions: [...doc.applied_exclusions, ...fresh], tasks };
}

// ---------------------------------------------------------------------------
// The model delta
// ---------------------------------------------------------------------------

/** One task to drop, with the one-line reason shown next to it in the plan
 *  summary. Optional tasks, or required ones inside a scope the manager
 *  asked to leave out — enforced by {@link validatePlannerDelta}. */
export type PlannerAiDrop = {
  id: string;
  reason: string;
};

/**
 * The only thing the model is allowed to return: adjustments to a draft we
 * already built. There is no "add task" operation, by design.
 */
export type PlannerAiDelta = {
  /**
   * Kinds of work the manager's notes ruled out, in the module's own scope
   * vocabulary. The product removes every task in each scope (except
   * release-day and distribution work), so this is how "no listening party"
   * typed into the notes becomes a plan with no listening party. The
   * validator refuses a scope name it does not know.
   */
  exclude_scopes: Array<{ scope: PlanScope; reason: string }>;
  drops: PlannerAiDrop[];
  adjust_offsets: Array<{ id: string; offset_days: number; reason?: string | null }>;
  /**
   * Role archetype to real person. Role level rather than per task: six roles
   * instead of sixty-four rows keeps the response small and its blast radius
   * understandable.
   */
  role_assignments: Array<{ role: TaskRole; member_user_id: string }>;
  rewrite_why: Array<{ id: string; why: string }>;
  /** Things worth the manager's attention — a schedule risk, an assumption
   *  the model made. Never a reason to change a task by itself; the plan
   *  summary shows these beside the deterministic warnings from
   *  {@link deriveScheduleWarnings}. Truncated at parse time, not rejected: a
   *  sixth or over-length warning is not worth discarding an otherwise-good
   *  delta over. */
  warnings: string[];
  rationale: string;
};

/**
 * Parse the drops array, tolerating the shape this replaced.
 *
 * The new shape is `drops: [{ id, reason }]`. A model that reverts to the old
 * bare `drop_task_ids: string[]` (a stale cached prompt, a lagging retry) is
 * mapped into `drops` with an empty reason rather than failing to parse at
 * all — the rest of a response is not worth discarding over one field's
 * shape, and {@link validatePlannerDelta} will reject the empty reason with a
 * specific, auditable error instead of this generic parse returning null.
 */
function parseDrops(record: Record<string, unknown>): PlannerAiDrop[] | null {
  if (Array.isArray(record.drops)) {
    const drops: PlannerAiDrop[] = [];
    for (const entry of record.drops) {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      if (typeof e.id !== 'string' || !e.id.trim()) return null;
      if (typeof e.reason !== 'string') return null;
      drops.push({ id: e.id, reason: e.reason.trim() });
    }
    return drops;
  }

  if (Array.isArray(record.drop_task_ids)) {
    if (!record.drop_task_ids.every((id) => typeof id === 'string' && id.trim())) return null;
    return (record.drop_task_ids as string[]).map((id) => ({ id, reason: '' }));
  }

  return null;
}

/** Absent parses as empty: a model still on the older contract is not worth
 *  failing over one missing key. Anything present has to be well-formed. */
function parseExcludeScopes(value: unknown): PlannerAiDelta['exclude_scopes'] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const entries: PlannerAiDelta['exclude_scopes'] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.scope !== 'string' || !e.scope.trim()) return null;
    if (typeof e.reason !== 'string') return null;
    // Handed through as a string; whether it is a scope we know is the
    // validator's call, so the rejection is specific and auditable.
    entries.push({ scope: e.scope.trim() as PlanScope, reason: e.reason.trim() });
  }
  return entries;
}

function parseWarnings(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const warnings: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') return null;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    warnings.push(trimmed.slice(0, MAX_WARNING_LENGTH));
  }
  return warnings.slice(0, MAX_DELTA_WARNINGS);
}

/**
 * Shape-only parse of raw model output. Returns null on any structural
 * problem, which the provider treats as a malformed response and retries.
 * Whether the ids are real is {@link validatePlannerDelta}'s job.
 */
export function parsePlannerAiDelta(raw: string): PlannerAiDelta | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;

  const excludeScopes = parseExcludeScopes(record.exclude_scopes);
  if (excludeScopes === null) return null;

  const drops = parseDrops(record);
  if (drops === null) return null;

  if (!Array.isArray(record.adjust_offsets)) return null;
  const adjustOffsets: PlannerAiDelta['adjust_offsets'] = [];
  for (const entry of record.adjust_offsets) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id.trim()) return null;
    if (typeof e.offset_days !== 'number' || !Number.isFinite(e.offset_days)) return null;
    const reason = typeof e.reason === 'string' && e.reason.trim() ? e.reason.trim() : null;
    adjustOffsets.push({ id: e.id, offset_days: Math.round(e.offset_days), reason });
  }

  if (!Array.isArray(record.role_assignments)) return null;
  const roleAssignments: PlannerAiDelta['role_assignments'] = [];
  for (const entry of record.role_assignments) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.role !== 'string' || !e.role.trim()) return null;
    if (typeof e.member_user_id !== 'string' || !e.member_user_id.trim()) return null;
    roleAssignments.push({ role: e.role as TaskRole, member_user_id: e.member_user_id });
  }

  if (!Array.isArray(record.rewrite_why)) return null;
  const rewriteWhy: PlannerAiDelta['rewrite_why'] = [];
  for (const entry of record.rewrite_why) {
    if (!entry || typeof entry !== 'object') return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id.trim()) return null;
    if (typeof e.why !== 'string' || !e.why.trim()) return null;
    rewriteWhy.push({ id: e.id, why: e.why.trim() });
  }

  const warnings = parseWarnings(record.warnings);
  if (warnings === null) return null;

  const rationale = typeof record.rationale === 'string' ? record.rationale.trim() : '';

  return {
    exclude_scopes: excludeScopes,
    drops,
    adjust_offsets: adjustOffsets,
    role_assignments: roleAssignments,
    rewrite_why: rewriteWhy,
    warnings,
    rationale: rationale.slice(0, MAX_RATIONALE_LENGTH),
  };
}

/** The subset of a draft task the validator needs. Tags are what decide
 *  whether a required task sits inside a scope the manager ruled out. */
export type PlannerValidationTask = {
  id: string;
  optional: boolean;
  tags: string[];
};

/**
 * The hard correctness gate. Confirms the model only referenced tasks we gave
 * it, only excluded scopes this module knows, only dropped tasks that were
 * either optional or inside a scope the manager asked to leave out, only named
 * people who can actually be assigned, and kept offsets inside a sane window.
 *
 * `excludedScopes` are the scopes the answers already ruled out; the delta's
 * own `exclude_scopes` count too. A required task outside every one of those
 * can never be dropped, and a keep-tagged task can never be dropped at all —
 * {@link isTaskInScope} is the one definition of "inside a scope" on both
 * sides, so the validator and the removal cannot disagree.
 *
 * A single violation rejects the entire response: partial application of a
 * response we already know is wrong is how a plan quietly loses a required
 * task. The caller keeps the deterministic draft and tells the manager the
 * plan follows the playbook and their answers.
 */
export function validatePlannerDelta(
  delta: PlannerAiDelta,
  options: {
    tasks: PlannerValidationTask[];
    memberUserIds: string[];
    excludedScopes?: PlanScope[];
  }
): { ok: true } | { ok: false; error: string } {
  const { tasks, memberUserIds, excludedScopes = [] } = options;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const members = new Set(memberUserIds);

  for (const entry of delta.exclude_scopes) {
    if (!isPlanScope(entry.scope)) {
      return { ok: false, error: `exclude_scopes names an unknown scope: ${entry.scope}` };
    }
    if (!entry.reason.trim()) {
      return { ok: false, error: `exclude_scopes entry needs a reason: ${entry.scope}` };
    }
    if (entry.reason.length > MAX_DROP_REASON_LENGTH) {
      return { ok: false, error: `exclude_scopes reason is too long for ${entry.scope}` };
    }
  }

  const scopes: PlanScope[] = [...excludedScopes, ...delta.exclude_scopes.map((e) => e.scope)];

  for (const drop of delta.drops) {
    const task = byId.get(drop.id);
    if (!task) {
      return { ok: false, error: `drops references unknown task: ${drop.id}` };
    }
    if (!task.optional && !scopes.some((scope) => isTaskInScope(task, scope))) {
      return {
        ok: false,
        error: `drops references a required task outside what the manager asked to leave out: ${drop.id}`,
      };
    }
    if (!drop.reason.trim()) {
      return { ok: false, error: `drops entry needs a reason: ${drop.id}` };
    }
    if (drop.reason.length > MAX_DROP_REASON_LENGTH) {
      return { ok: false, error: `drops reason is too long for task ${drop.id}` };
    }
  }

  for (const adjustment of delta.adjust_offsets) {
    if (!byId.has(adjustment.id)) {
      return { ok: false, error: `adjust_offsets references unknown task: ${adjustment.id}` };
    }
    if (adjustment.offset_days < MIN_TASK_OFFSET || adjustment.offset_days > MAX_TASK_OFFSET) {
      return {
        ok: false,
        error: `adjust_offsets is out of range for task ${adjustment.id}: ${adjustment.offset_days}`,
      };
    }
  }

  for (const assignment of delta.role_assignments) {
    if (!members.has(assignment.member_user_id)) {
      return {
        ok: false,
        error: `role_assignments references someone who cannot be assigned: ${assignment.member_user_id}`,
      };
    }
  }

  for (const rewrite of delta.rewrite_why) {
    if (!byId.has(rewrite.id)) {
      return { ok: false, error: `rewrite_why references unknown task: ${rewrite.id}` };
    }
    if (rewrite.why.length > MAX_AI_WHY_LENGTH) {
      return { ok: false, error: `rewrite_why is too long for task ${rewrite.id}` };
    }
  }

  return { ok: true };
}

/**
 * Fold a validated delta into a draft: the model's excluded scopes first
 * (through {@link applyScopeExclusions}, so a scope the answers already
 * removed is not re-attributed), then the per-task drops, dates, why lines
 * and role assignments.
 *
 * Rows already removed, rows the manager edited by hand, and rows the manager
 * added are never touched: a drop the model names against a task the answers
 * already removed is a no-op, so the reason on it stays the manager's own.
 */
export function applyDeltaToDraft(doc: ReleasePlanDraftDoc, delta: PlannerAiDelta): ReleasePlanDraftDoc {
  const excluded = applyScopeExclusions(
    doc,
    delta.exclude_scopes.map((entry) => ({ scope: entry.scope, by: 'ai' as const, reason: entry.reason }))
  );

  const dropReasons = new Map(delta.drops.map((d) => [d.id, d.reason]));
  const offsets = new Map(delta.adjust_offsets.map((a) => [a.id, a]));
  const whys = new Map(delta.rewrite_why.map((r) => [r.id, r.why]));
  const roleToMember = new Map(delta.role_assignments.map((a) => [a.role, a.member_user_id]));

  const tasks = excluded.tasks.map((task) => {
    if (task.origin !== 'template' || task.edited || task.removed) return task;

    const next: DraftTask = { ...task };

    const dropReason = dropReasons.get(task.id);
    if (dropReason !== undefined) {
      next.removed = true;
      next.removed_by = 'ai';
      next.removed_reason = dropReason || null;
    }

    const offset = offsets.get(task.id);
    if (offset) {
      next.offset_days = offset.offset_days;
      next.phase = derivePlanPhase(offset.offset_days);
      next.change_reason = offset.reason ?? next.change_reason;
    }

    const why = whys.get(task.id);
    if (why) {
      next.why = why;
    }

    // The deterministic history/role heuristic (proposeTaskOwners, run before
    // the model is ever called) outranks a model role-archetype guess — a
    // specific person who has actually done this before is worth more than a
    // role match against a live team roster the model cannot fully see.
    if (task.role && task.assignee_basis !== 'history') {
      const member = roleToMember.get(task.role);
      if (member) {
        next.assignee_user_id = member;
        next.assignee_basis = 'ai';
      }
    }

    return next;
  });

  return {
    ...excluded,
    ai: { applied: true, rationale: delta.rationale || null, failure: null, warnings: delta.warnings },
    tasks,
  };
}

/**
 * Stamp lib/task-owners.ts's per-task owner proposals onto a fresh draft,
 * before the model is ever called (see createReleasePlan in
 * lib/release-planning-actions-server.ts). Deterministic, and independent of
 * whether AI is configured at all — this is another layer of template
 * refinement, not tailoring.
 *
 * A 'creator' proposal changes nothing: buildDraftFromTemplate already
 * defaults every task's assignee to the release owner with assignee_basis
 * null, and a 'creator' proposal is exactly that same answer. Leaving it
 * untouched is what keeps "nobody has done this before" reading as the plain,
 * unlabelled default rather than a provenance claim with nothing behind it.
 */
export function applyOwnerProposals(
  doc: ReleasePlanDraftDoc,
  proposals: ProposedOwner[]
): ReleasePlanDraftDoc {
  const byTaskId = new Map(proposals.map((proposal) => [proposal.taskId, proposal]));

  const tasks = doc.tasks.map((task) => {
    const proposal = byTaskId.get(task.id);
    if (!proposal || proposal.basis === 'creator') return task;
    return { ...task, assignee_user_id: proposal.userId, assignee_basis: proposal.basis };
  });

  return { ...doc, tasks };
}

// ---------------------------------------------------------------------------
// Whole-document validation
// ---------------------------------------------------------------------------

const DRAFT_ORIGINS: DraftTaskOrigin[] = ['template', 'user'];
const DRAFT_TASK_TYPES: Array<DraftTask['task_type']> = ['task', 'event_milestone'];

/** Reads an untrusted assignee_basis value, the removed_by precedent exactly:
 *  a chain of `===` checks narrows the type through control flow, so nothing
 *  outside the closed set can survive the parse. */
function readAssigneeBasis(value: unknown): DraftTask['assignee_basis'] {
  return value === 'history' || value === 'role' || value === 'ai' || value === 'user'
    ? value
    : null;
}

/**
 * Validate a whole plan document read back from `release_plan_drafts`. The
 * phases are recomputed rather than trusted, and a template provenance id the
 * named template does not know is refused.
 *
 * Reads schema version 1 (every plan approved before exclusions existed) as
 * version 2 with nothing applied, so the plan summary keeps working for
 * rollouts already planned. Assignees are deliberately NOT checked against
 * workspace membership here; instantiation is where they are settled.
 */
export function parseDraftDoc(
  value: unknown,
  options: { knownTemplateTaskIds?: Set<string> } = {}
): { ok: true; doc: ReleasePlanDraftDoc } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'doc must be an object.' };
  }
  const record = value as Record<string, unknown>;

  if (record.schema_version !== 1 && record.schema_version !== PLAN_DRAFT_SCHEMA_VERSION) {
    return { ok: false, error: 'This plan is from an older version. Plan again.' };
  }
  if (!RELEASE_TYPES.includes(record.release_type as PlanReleaseType)) {
    return { ok: false, error: 'doc.release_type is not a format the planner supports.' };
  }
  if (!Array.isArray(record.tasks)) {
    return { ok: false, error: 'doc.tasks must be an array.' };
  }
  if (record.tasks.length > MAX_DRAFT_TASKS) {
    return { ok: false, error: `A plan cannot hold more than ${MAX_DRAFT_TASKS} tasks.` };
  }

  const intakeResult = parseReleasePlanIntake(record.intake);
  if (!intakeResult.ok) {
    return { ok: false, error: `doc.intake is invalid: ${intakeResult.error}` };
  }

  const seenIds = new Set<string>();
  const tasks: DraftTask[] = [];

  for (const entry of record.tasks) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'Every task in the plan must be an object.' };
    }
    const t = entry as Record<string, unknown>;

    const id = typeof t.id === 'string' ? t.id.trim() : '';
    if (!id) return { ok: false, error: 'Every task in the plan needs an id.' };
    if (seenIds.has(id)) return { ok: false, error: `Duplicate task id in the plan: ${id}` };
    seenIds.add(id);

    const origin = DRAFT_ORIGINS.includes(t.origin as DraftTaskOrigin)
      ? (t.origin as DraftTaskOrigin)
      : null;
    if (!origin) return { ok: false, error: `Task ${id} has an unknown origin.` };

    const templateTaskId =
      typeof t.template_task_id === 'string' && t.template_task_id.trim()
        ? t.template_task_id.trim()
        : null;
    if (origin === 'template') {
      if (!templateTaskId) {
        return { ok: false, error: `Task ${id} claims to come from the playbook but names no source.` };
      }
      if (options.knownTemplateTaskIds && !options.knownTemplateTaskIds.has(templateTaskId)) {
        return { ok: false, error: `Task ${id} references a playbook step that does not exist.` };
      }
    }

    const title = typeof t.title === 'string' ? t.title.trim() : '';
    if (!title) return { ok: false, error: `Task ${id} needs a title.` };
    if (title.length > MAX_DRAFT_TITLE_LENGTH) {
      return { ok: false, error: `Task ${id} has a title that is too long.` };
    }

    const why = typeof t.why === 'string' ? t.why.trim() : '';
    if (why.length > MAX_DRAFT_WHY_LENGTH) {
      return { ok: false, error: `Task ${id} has a note that is too long.` };
    }

    if (typeof t.offset_days !== 'number' || !Number.isFinite(t.offset_days)) {
      return { ok: false, error: `Task ${id} needs a date.` };
    }
    const offsetDays = Math.round(t.offset_days);
    if (offsetDays < MIN_TASK_OFFSET || offsetDays > MAX_TASK_OFFSET) {
      return { ok: false, error: `Task ${id} is dated too far from release day.` };
    }

    const durationDays =
      typeof t.duration_days === 'number' && Number.isFinite(t.duration_days)
        ? Math.max(1, Math.round(t.duration_days))
        : 1;

    const dependsOn = Array.isArray(t.depends_on)
      ? t.depends_on.filter((dep): dep is string => typeof dep === 'string' && Boolean(dep.trim()))
      : [];

    tasks.push({
      id,
      template_task_id: templateTaskId,
      origin,
      title: title.slice(0, MAX_DRAFT_TITLE_LENGTH),
      why,
      // Always recomputed: the client's phase is a rendering detail, the
      // offset is the truth.
      phase: derivePlanPhase(offsetDays),
      offset_days: offsetDays,
      duration_days: durationDays,
      role: typeof t.role === 'string' && t.role.trim() ? (t.role as TaskRole) : null,
      assignee_user_id:
        typeof t.assignee_user_id === 'string' && t.assignee_user_id.trim()
          ? t.assignee_user_id.trim()
          : null,
      optional: t.optional === true,
      task_type: DRAFT_TASK_TYPES.includes(t.task_type as DraftTask['task_type'])
        ? (t.task_type as DraftTask['task_type'])
        : 'task',
      tags: Array.isArray(t.tags)
        ? t.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      depends_on: dependsOn,
      removed: t.removed === true,
      removed_by:
        t.removed_by === 'ai' || t.removed_by === 'user' || t.removed_by === 'intake'
          ? t.removed_by
          : null,
      removed_reason:
        typeof t.removed_reason === 'string' && t.removed_reason.trim()
          ? t.removed_reason.trim().slice(0, MAX_DROP_REASON_LENGTH)
          : null,
      change_reason:
        typeof t.change_reason === 'string' && t.change_reason.trim()
          ? t.change_reason.trim().slice(0, MAX_WARNING_LENGTH)
          : null,
      assignee_basis: readAssigneeBasis(t.assignee_basis),
      edited: t.edited === true,
    });
  }

  // Dependency edges may only point at tasks in this same draft. Anything else
  // would translate to a dangling UUID at approval.
  for (const task of tasks) {
    task.depends_on = task.depends_on.filter((dep) => seenIds.has(dep) && dep !== task.id);
  }

  const aiRecord =
    record.ai && typeof record.ai === 'object' ? (record.ai as Record<string, unknown>) : {};

  // Tolerant on purpose: a version 1 document has no such key, and an entry
  // naming a scope this build does not know (a rollback) is dropped rather
  // than failing the whole read. One entry per scope, first wins.
  const appliedExclusions: AppliedExclusion[] = [];
  if (Array.isArray(record.applied_exclusions)) {
    for (const entry of record.applied_exclusions) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (!isPlanScope(e.scope)) continue;
      if (appliedExclusions.some((seen) => seen.scope === e.scope)) continue;
      const by = e.by === 'intake' || e.by === 'budget' || e.by === 'ai' ? e.by : 'intake';
      const reason =
        typeof e.reason === 'string' && e.reason.trim()
          ? e.reason.trim().slice(0, MAX_DROP_REASON_LENGTH)
          : exclusionReason(e.scope, by === 'budget' ? 'budget' : 'intake');
      appliedExclusions.push({ scope: e.scope, by, reason });
    }
  }

  const doc: ReleasePlanDraftDoc = {
    schema_version: PLAN_DRAFT_SCHEMA_VERSION,
    template_id: typeof record.template_id === 'string' ? record.template_id : '',
    template_version: typeof record.template_version === 'string' ? record.template_version : '',
    release_type: record.release_type as PlanReleaseType,
    generated_at: typeof record.generated_at === 'string' ? record.generated_at : '',
    generated_for_release_date:
      typeof record.generated_for_release_date === 'string' &&
      YMD_PATTERN.test(record.generated_for_release_date)
        ? record.generated_for_release_date
        : null,
    intake: intakeResult.intake,
    ai: {
      applied: aiRecord.applied === true,
      rationale:
        typeof aiRecord.rationale === 'string' && aiRecord.rationale.trim()
          ? aiRecord.rationale.trim().slice(0, MAX_RATIONALE_LENGTH)
          : null,
      failure: PLAN_DRAFT_FAILURES.includes(aiRecord.failure as PlanDraftFailure)
        ? (aiRecord.failure as PlanDraftFailure)
        : null,
      warnings: Array.isArray(aiRecord.warnings)
        ? aiRecord.warnings
            .filter((w): w is string => typeof w === 'string' && Boolean(w.trim()))
            .map((w) => w.trim().slice(0, MAX_WARNING_LENGTH))
            .slice(0, MAX_DELTA_WARNINGS)
        : [],
    },
    applied_exclusions: appliedExclusions,
    tasks,
  };

  return { ok: true, doc };
}

/** Tasks that will become real rows: everything not soft-removed. */
export function activeDraftTasks(doc: ReleasePlanDraftDoc): DraftTask[] {
  return doc.tasks.filter((task) => !task.removed);
}

/** Active tasks in one phase, in draft order. */
export function draftTasksByPhase(doc: ReleasePlanDraftDoc, phase: PlanPhase): DraftTask[] {
  return activeDraftTasks(doc).filter((task) => task.phase === phase);
}

/**
 * Warnings computed at RENDER time, never stored — they describe the plan as
 * it stands right now against today's date, so a stored copy would go stale
 * the moment a day passed or the manager moved the release date. These are
 * distinct from `delta.warnings` (a model's one-off assumptions about a
 * single generation), and the plan summary shows both together.
 *
 * At most one of the two warnings below fires: "before today" is meaningless
 * without a release date to compute absolute dates from, so a missing date
 * short-circuits straight to that warning instead.
 */
export function deriveScheduleWarnings(
  doc: ReleasePlanDraftDoc,
  releaseDate: string | null,
  todayYmd: string
): string[] {
  if (!releaseDate) {
    return ['No release date is set yet, so these dates are relative to release day only.'];
  }

  const todayEpoch = parseYmd(todayYmd);
  if (todayEpoch === null) return [];

  let beforeToday = 0;
  for (const task of activeDraftTasks(doc)) {
    const taskYmd = computeTaskYmd(releaseDate, task.offset_days);
    const taskEpoch = taskYmd ? parseYmd(taskYmd) : null;
    if (taskEpoch !== null && taskEpoch < todayEpoch) beforeToday += 1;
  }

  if (beforeToday === 0) return [];

  const verb = beforeToday === 1 ? 'task lands' : 'tasks land';
  return [`${beforeToday} ${verb} before today. They stay in the plan under Catch up.`];
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

const RELEASE_TYPE_LABELS = Object.fromEntries(
  RELEASE_TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<PlanReleaseType, string>;
const READY_LABELS = Object.fromEntries(READY_TODAY_OPTIONS.map((o) => [o.value, o.label]));
const GOAL_LABELS = Object.fromEntries(GOAL_OPTIONS.map((o) => [o.value, o.label]));
const BUDGET_LABELS = Object.fromEntries(BUDGET_OPTIONS.map((o) => [o.value, o.label]));

export type PlannerPromptTask = {
  id: string;
  title: string;
  why: string;
  role: TaskRole | null;
  offset_days: number;
  optional: boolean;
  tags: string[];
};

export type PlannerPromptMember = {
  user_id: string;
  name: string;
  role: string;
};

/** The draft tasks the model is allowed to reference, in prompt shape. */
export function toPromptTasks(tasks: DraftTask[]): PlannerPromptTask[] {
  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    why: task.why,
    role: task.role,
    offset_days: task.offset_days,
    optional: task.optional,
    tags: task.tags,
  }));
}

function describeIntake(intake: ReleasePlanIntake): string[] {
  const ready = intake.ready_today.length
    ? intake.ready_today.map((item) => READY_LABELS[item] || item).join('; ')
    : 'not stated';

  const lines = [
    `- Format: ${RELEASE_TYPE_LABELS[intake.release_type] || intake.release_type}`,
    `- Artist: ${intake.artist_name}`,
    `- Release date: ${intake.release_date || 'not set'}`,
    `- Ready today: ${ready}`,
    `- Main goal: ${GOAL_LABELS[intake.goal] || intake.goal}`,
    `- Rollout budget: ${BUDGET_LABELS[intake.budget] || intake.budget}`,
  ];
  if (intake.exclusions?.length) {
    lines.push(
      `- Asked to leave out: ${intake.exclusions.map((scope) => PLAN_SCOPE_LABELS[scope]).join(', ')}`
    );
  }
  if (intake.goal_text) lines.push(`- Goal in their words: "${intake.goal_text}"`);
  if (intake.extra_notes) lines.push(`- Their notes: "${intake.extra_notes}"`);
  return lines;
}

const SCOPE_VOCABULARY_LINE = `- The scopes: ${PLAN_SCOPE_OPTIONS.map(
  (option) => `${option.value} (${option.covers})`
).join('; ')}. Release-day and distribution work is never removed by a scope.`;

const OUTPUT_SCHEMA_BLOCK = [
  'Output schema:',
  '{',
  `  "exclude_scopes": [{ "scope": "<${PLAN_SCOPES.join('|')}>", "reason": "<one short line>" }],`,
  '  "drops": [{ "id": "<task id>", "reason": "<one short line>" }],',
  '  "adjust_offsets": [{ "id": "<task id>", "offset_days": <integer>, "reason": "<one short line, or null>" }],',
  '  "role_assignments": [{ "role": "<role>", "member_user_id": "<member user_id>" }],',
  '  "rewrite_why": [{ "id": "<task id>", "why": "<one short line>" }],',
  '  "warnings": ["<one short line for the manager, at most 5>"],',
  '  "rationale": "<2-3 sentences for the manager>"',
  '}',
].join('\n');

function buildSystemPrompt(): string {
  return [
    'You are UrgAns, tailoring a music release rollout plan that was already built from a hand-crafted playbook. You adjust that plan. You never write a new one.',
    '',
    'Voice: you are strict and a little bossy, and a creative at heart — you exist to get this rollout out on time, and it shows in how you write. Every text field you write (the "reason" on a drop or an excluded scope, "warnings", the "why" lines, and "rationale") is read by the manager as coming from you: direct, specific to THIS rollout (use the artist, the date, what is and is not ready — never generic filler), and pushing toward action rather than just describing the plan. No hedging ("might", "could consider"). Say what matters and why it matters now.',
    '',
    'Rules:',
    "- The manager's answers and notes are instructions, not hints. If they rule something out, the plan must not contain it. If they ask for less of something, keep that work and drop its optional tasks.",
    '- You cannot add tasks. There is no operation for it. The manager adds anything the playbook is missing.',
    '- Drop an optional task ("optional": true) whenever this rollout does not need it, with a reason.',
    '- A task whose "optional" is false may be dropped ONLY when the manager plainly asked to leave that kind of work out. The way to do that is "exclude_scopes": name the scope, and the product removes every task in it except release-day and distribution work. Inside a scope you excluded you may also drop single required tasks. Never exclude a scope they did not ask for. "Less", "light" or "small" means keep the scope and drop its optional tasks.',
    SCOPE_VOCABULARY_LINE,
    '- Every drop and every excluded scope needs a "reason": one short line explaining why, shown to the manager next to it. Never drop anything with no reason.',
    '- Be conservative about the STRUCTURE of the plan (dates, drops, assignments) beyond what the manager asked for. When in doubt, keep the task and leave its date alone. Being conservative does not mean being bland in the text fields — those should read like you actually looked at this rollout.',
    '- A task landing before today is never by itself a reason to drop it or move it. It stays in the plan; the product shows it under "Catch up".',
    '- Every id you return MUST be copied verbatim from the task list provided. Never invent an id.',
    '- Only assign people from the team list provided, using their exact member_user_id.',
    '- Rewrite a "why" line only when this rollout\'s context genuinely changes it. Keep each rewrite under 160 characters, plain and specific. Leave the rest alone.',
    '- offset_days is days relative to release day. Negative is before, 0 is release day, positive is after.',
    '- Use "warnings" for anything worth the manager\'s attention — a real schedule risk, an assumption you made. Not a reason to change a task by itself. At most 5, each one short line.',
    '- Adjust across the whole plan.',
    '- Return ONLY valid JSON matching the schema below. No prose, no markdown, no text outside the JSON object — and inside the string VALUES themselves, still no markdown syntax (no **asterisks**, no # headers): they render as plain text on screen, so asterisks would show up literally.',
    '',
    OUTPUT_SCHEMA_BLOCK,
  ].join('\n');
}

const BUDGET_GUIDANCE: Record<PlanBudget, string> = {
  none: '- No promo budget: the paid ads work is already out of the plan. Never suggest paid pushes, boosted posts or ad spend anywhere in your text.',
  under_100k:
    '- A small budget, under ₦100k: keep the cheapest promotion only. Drop the optional paid pushes and keep the organic work.',
  '100k_500k':
    '- A real budget, ₦100k to ₦500k: keep the paid and promotional work, and pull it earlier where the runway allows.',
  over_500k:
    '- A large budget, over ₦500k: keep every paid and promotional task and start the paid work earlier.',
};

const READY_GUIDANCE: Record<ReadyItem, string> = {
  master:
    '- The master is done: the recording and mastering runway can compress. Drop the optional mastering steps and pull the work that waited on the master earlier.',
  artwork:
    '- Cover art is ready: the design pass is done. Drop the optional artwork steps and pull anything that waited on art earlier.',
  visualizer:
    '- A video or visualizer is ready: leave no time for producing one, and move the work that uses it earlier.',
  distributor:
    '- The distributor is already set up: the setup tasks can move later or drop if they are optional.',
  none: '- Nothing is ready yet: leave the asset production runway exactly as the playbook has it.',
};

const GOAL_GUIDANCE: Record<PlanGoal, string> = {
  new_listeners:
    '- Goal, reach new listeners: discovery work (playlists, content, sharing) is the spine. Keep it and say so in the why lines.',
  playlist_adds:
    '- Goal, playlist adds: pitching and pre-saves are the spine. Move them earlier where you can.',
  press: '- Goal, press coverage: press assets and outreach lead. Give them room and make them specific.',
  fan_moment:
    '- Goal, a moment for current fans: direct-to-fan work (community, live moments, thank-yous) comes first. Discovery work matters less.',
  catalog:
    '- Goal, build the catalog quietly: a light rollout. Drop the optional promotion and keep the release and distribution work tight.',
};

function buildGuidance(
  intake: ReleasePlanIntake,
  options?: { fallbackToSingle?: boolean; appliedExclusions?: AppliedExclusion[] }
): string {
  const lines = ['How to read the answers:'];

  const applied = options?.appliedExclusions ?? [];
  if (applied.length) {
    lines.push(
      `- Already left out at the manager's request: ${applied
        .map((entry) => PLAN_SCOPE_LABELS[entry.scope])
        .join(', ')}. Those tasks are not in the list below. Do not mention them, and do not suggest bringing them back.`
    );
  }

  lines.push(BUDGET_GUIDANCE[intake.budget]);

  for (const item of intake.ready_today) {
    lines.push(READY_GUIDANCE[item]);
  }

  lines.push(GOAL_GUIDANCE[intake.goal]);

  if (intake.goal_text || intake.extra_notes) {
    lines.push(
      '- Their notes above are instructions. If they rule out a kind of work, return it in exclude_scopes with their words as the reason. If they ask for less of something, keep the scope and drop its optional tasks. If they ask for something the playbook has no task for, say so in a warning rather than inventing one.'
    );
  }

  lines.push(
    '- A tight window between today and release day: pull the essential tasks earlier rather than dropping required work.'
  );

  if (intake.release_type !== 'single') {
    const formatLabel = intake.release_type === 'ep' ? 'an EP' : 'an album';
    if (options?.fallbackToSingle) {
      // No playbook for this format is switched on, so the draft really did
      // come from the single one and the model should compensate for that.
      lines.push(
        `- This is ${formatLabel} planned from the single playbook. Stretch the asset and content work to cover more tracks, and mention a lead single in the why lines where it fits. Do not try to invent per-track tasks: there is no operation for adding them.`
      );
    } else {
      // The draft came from the format's own playbook, which already carries
      // the multi-track work and the staggered single drops. Telling the model
      // to "stretch the asset work to cover more tracks" here would make it
      // duplicate what is already in front of it.
      const singles =
        intake.release_type === 'ep'
          ? 'The lead single drop and its runway are already in the plan'
          : 'Both staggered single drops and their runways are already in the plan';
      lines.push(
        `- This is ${formatLabel} planned from the ${intake.release_type === 'ep' ? 'EP' : 'album'} playbook, so the multi-track work is already there. ${singles} — adjust their dates to this rollout's context rather than restating them, and do not try to invent per-track tasks: there is no operation for adding them.`
      );
    }
  }

  return lines.join('\n');
}

/**
 * Build the messages for a tailoring call. Same discipline the superseded
 * tailor-plan feature used: the full candidate task list is embedded so the
 * model has real ids to copy, and the schema is stated explicitly.
 *
 * `tasks` should be the tasks that SURVIVED the answers' own exclusions, and
 * `appliedExclusions` what those were — the model is told what is already
 * out so it neither mentions it nor tries to bring it back.
 */
export function buildPlannerMessages(params: {
  release: { title: string; artistName: string; releaseDate: string | null };
  intake: ReleasePlanIntake;
  tasks: PlannerPromptTask[];
  members: PlannerPromptMember[];
  todayYmd: string;
  /** True when this draft came from the single playbook despite being an EP or
   * album — i.e. that format's playbook exists but is switched off. Changes one
   * guidance line, so the prompt never claims a provenance it does not have. */
  fallbackToSingle?: boolean;
  appliedExclusions?: AppliedExclusion[];
}): Array<{ role: 'system' | 'user'; content: string }> {
  const { release, intake, tasks, members, todayYmd, fallbackToSingle, appliedExclusions } = params;

  const system = buildSystemPrompt();

  const user = [
    'Release:',
    `- Title: ${release.title}`,
    `- Artist: ${release.artistName}`,
    `- Release date: ${release.releaseDate || 'not set'}`,
    `- Today: ${todayYmd}`,
    '',
    'What the manager told us:',
    ...describeIntake(intake),
    '',
    buildGuidance(intake, { fallbackToSingle, appliedExclusions }),
    '',
    'Team available for assignment (use member_user_id verbatim):',
    JSON.stringify(members, null, 2),
    '',
    'Current plan (only these ids may appear in your response):',
    JSON.stringify(tasks, null, 2),
    '',
    'Return the JSON now.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

// ---------------------------------------------------------------------------
// Structured output
// ---------------------------------------------------------------------------

/** The role archetypes a template task can carry, for the schema's enum. Kept
 *  beside the schema rather than imported from the template types, which
 *  declare TaskRole as a type only. */
export const PLANNER_ROLE_VALUES: TaskRole[] = [
  'artist',
  'manager',
  'marketing_lead',
  'designer',
  'distributor_contact',
  'team',
];

const strictObject = <P extends Record<string, unknown>>(properties: P) =>
  ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  }) as const;

/**
 * The delta as a JSON schema for the gateway's structured-output mode, so a
 * capable model returns exactly this shape instead of merely being asked to.
 * Written to strict mode's rules: every property required, no open objects,
 * nullable expressed as a type union, and NO length or format keywords —
 * strict mode rejects or ignores those, so every limit stays in
 * {@link validatePlannerDelta}. The parser above is unchanged and still
 * tolerant, because a gateway that cannot honour the schema falls back to
 * plain JSON mode.
 */
export const PLANNER_DELTA_JSON_SCHEMA = strictObject({
  exclude_scopes: {
    type: 'array',
    items: strictObject({
      scope: { type: 'string', enum: [...PLAN_SCOPES] },
      reason: { type: 'string' },
    }),
  },
  drops: {
    type: 'array',
    items: strictObject({ id: { type: 'string' }, reason: { type: 'string' } }),
  },
  adjust_offsets: {
    type: 'array',
    items: strictObject({
      id: { type: 'string' },
      offset_days: { type: 'integer' },
      reason: { type: ['string', 'null'] },
    }),
  },
  role_assignments: {
    type: 'array',
    items: strictObject({
      role: { type: 'string', enum: PLANNER_ROLE_VALUES },
      member_user_id: { type: 'string' },
    }),
  },
  rewrite_why: {
    type: 'array',
    items: strictObject({ id: { type: 'string' }, why: { type: 'string' } }),
  },
  warnings: { type: 'array', items: { type: 'string' } },
  rationale: { type: 'string' },
});
