/**
 * Shared types, validation, and prompt construction for the UrgAns release
 * planner. Client-safe (no node imports) so the intake wizard and the review
 * scene import the option constants, labels and pure date math while the API
 * routes import the parsers, validators and prompt builders.
 *
 * ## The shape of this feature
 *
 * The planner never asks a model for a plan. It builds a deterministic draft
 * from the hand-crafted template first, then asks for a DELTA against that
 * draft: drop optional tasks, shift offsets, map role archetypes to real
 * people, rewrite a few "why this matters" lines. Every id in that delta must
 * be one we supplied, and the whole response is rejected if any of it is not.
 *
 * The model cannot add tasks. That is deliberate: a task with no template
 * origin is exactly the "AI invents tasks from scratch" failure mode CLAUDE.md
 * forbids, and there would be nothing to validate it against. The manager adds
 * tasks by hand in the review scene instead.
 *
 * With no model configured the deterministic draft IS the plan, which is what
 * makes the whole flow work with AI switched off.
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
 * 'unknown' is a valid PARSED value (parseReleasePlanIntake accepts it) but
 * deliberately never a RADIO CHOICE — absent from GOAL_OPTIONS below, so the
 * seven-question modal can never offer it. It is what a one-tap "Draft the
 * plan" (buildAutoIntake) writes when nobody has answered this question yet.
 */
export type PlanGoal =
  | 'new_listeners'
  | 'playlist_adds'
  | 'press'
  | 'fan_moment'
  | 'catalog'
  | 'unknown';

/** Rollout budget in naira. Display labels live in BUDGET_OPTIONS. 'unknown'
 *  carries the same never-a-radio-choice contract as PlanGoal above. */
export type PlanBudget = 'none' | 'under_100k' | '100k_500k' | 'over_500k' | 'unknown';

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
  /** Q7 — free text, prefilled from a note when the flow starts from one. */
  extra_notes?: string;
  /** Absent means 'answered' — every producer before 2026-09-03 (the modal,
   *  the Chappi tool, every existing test) writes no such field and must keep
   *  meaning "someone answered these questions". 'auto' marks an intake
   *  buildAutoIntake derived with no questions asked, for the "UrgAns drafted
   *  this from the release facts alone" notice and the guidance this feeds
   *  buildGuidance. */
  intake_source?: 'auto' | 'answered';
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

const RELEASE_TYPES = RELEASE_TYPE_OPTIONS.map((o) => o.value);
const READY_ITEMS = READY_TODAY_OPTIONS.map((o) => o.value);
const GOALS = GOAL_OPTIONS.map((o) => o.value);
const BUDGETS = BUDGET_OPTIONS.map((o) => o.value);
/** What parseReleasePlanIntake actually ACCEPTS for goal/budget — the visible
 *  options plus 'unknown'. Kept separate from GOALS/BUDGETS above because
 *  those two feed the validation error strings, and 'unknown' must never
 *  appear there: a Chappi-relayed "goal must be one of: ..., unknown" would
 *  teach the model to answer with the word instead of asking the manager. */
const GOALS_ACCEPTED: PlanGoal[] = [...GOALS, 'unknown'];
const BUDGETS_ACCEPTED: PlanBudget[] = [...BUDGETS, 'unknown'];

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
  if (!GOALS_ACCEPTED.includes(record.goal as PlanGoal)) {
    return { ok: false, error: `goal must be one of: ${GOALS.join(', ')}.` };
  }
  if (!BUDGETS_ACCEPTED.includes(record.budget as PlanBudget)) {
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
  if (record.intake_source === 'auto' || record.intake_source === 'answered') {
    intake.intake_source = record.intake_source;
  }

  return { ok: true, intake };
}

/**
 * The intake for a one-tap "Draft the plan": derived entirely from what the
 * release row already knows, with no questions asked.
 *
 * `goal`/`budget` are 'unknown' rather than a guessed real value —
 * pretending to know either would be worse than admitting we don't, and
 * {@link buildGuidance} tells the model so in plain words. This is a direct
 * TypeScript construction, not an untrusted payload, so it never goes through
 * {@link parseReleasePlanIntake}; 'unknown' only has to be a value that
 * validator can later ACCEPT when this intake round-trips through
 * `releases.release_context`.
 */
export function buildAutoIntake(release: {
  release_type?: string | null;
  artist_name?: string | null;
  release_date?: string | null;
}): ReleasePlanIntake {
  const releaseType: PlanReleaseType =
    release.release_type === 'ep' || release.release_type === 'album'
      ? release.release_type
      : 'single';

  return {
    version: 2,
    release_type: releaseType,
    artist_name: (release.artist_name || '').trim(),
    date_mode: release.release_date ? 'fixed' : 'suggested',
    release_date: release.release_date || null,
    ready_today: [],
    goal: 'unknown',
    budget: 'unknown',
    intake_source: 'auto',
  };
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
 * those banners, so the four groups the review scene shows are the same weeks
 * the playbook was written in. Any stored phase is recomputed through here, so
 * this is the only definition.
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

export const PLAN_DRAFT_SCHEMA_VERSION = 1;

export const MAX_DRAFT_TASKS = 200;
export const MAX_DRAFT_TITLE_LENGTH = 140;
export const MAX_DRAFT_WHY_LENGTH = 600;
/** What the model may write. Shorter than a manager's own edit on purpose. */
export const MAX_AI_WHY_LENGTH = 160;
export const MAX_RATIONALE_LENGTH = 600;
/** A drop is a bigger claim than a reword, but it is still a one-liner shown
 *  next to a chip in the review scene, not a paragraph. */
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
  /** Soft removal, so a drop can be explained and undone before approval. */
  removed: boolean;
  removed_by: 'ai' | 'user' | null;
  /** UrgAns's one-line reason for dropping this task, shown beside the
   *  dropped chip in the review scene. Null when removed_by is 'user' (a
   *  manager removing their own row needs no explanation) or when the task
   *  has never been dropped. Required by validatePlannerDelta whenever
   *  removed_by is 'ai'. */
  removed_reason: string | null;
  /** UrgAns's one-line reason for moving this task's date, shown as "Moved:
   *  {change_reason}" in the review scene. Optional even from the model — a
   *  small date shift often needs no explanation — so this stays null far
   *  more often than removed_reason does. */
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
  /** The manager touched this row. Regenerating a phase leaves it alone. */
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

export type ReleasePlanDraftDoc = {
  schema_version: 1;
  template_id: string;
  template_version: string;
  release_type: PlanReleaseType;
  generated_at: string;
  /** The release date the draft was generated against, for the moved-date notice. */
  generated_for_release_date: string | null;
  intake: ReleasePlanIntake;
  ai: PlanDraftAiState;
  tasks: DraftTask[];
};

/** What the review scene and the approval step agree a saved draft looks like. */
export type ReleasePlanDraft = {
  id: string;
  status: 'draft' | 'approved';
  doc: ReleasePlanDraftDoc;
  updatedAt: string;
  approvedAt: string | null;
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
    tasks,
  };
}

// ---------------------------------------------------------------------------
// The model delta
// ---------------------------------------------------------------------------

/** One task to drop, with the one-line reason the review scene shows next to
 *  its chip. Optional tasks only — enforced by {@link validatePlannerDelta}. */
export type PlannerAiDrop = {
  id: string;
  reason: string;
};

/**
 * The only thing the model is allowed to return: adjustments to a draft we
 * already built. There is no "add task" operation, by design.
 */
export type PlannerAiDelta = {
  drops: PlannerAiDrop[];
  adjust_offsets: Array<{ id: string; offset_days: number; reason?: string | null }>;
  /**
   * Role archetype to real person. Role level rather than per task: six roles
   * instead of sixty-four rows keeps the response small and its blast radius
   * understandable.
   */
  role_assignments: Array<{ role: TaskRole; member_user_id: string }>;
  rewrite_why: Array<{ id: string; why: string }>;
  /** Things worth the manager's attention before approving — a schedule risk,
   *  an assumption the model made. Never a reason to change a task by itself;
   *  the review scene shows these beside the deterministic warnings from
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
    drops,
    adjust_offsets: adjustOffsets,
    role_assignments: roleAssignments,
    rewrite_why: rewriteWhy,
    warnings,
    rationale: rationale.slice(0, MAX_RATIONALE_LENGTH),
  };
}

/** The subset of a draft task the validator needs. */
export type PlannerValidationTask = {
  id: string;
  optional: boolean;
};

/**
 * The hard correctness gate. Confirms the model only referenced tasks we gave
 * it, only dropped tasks the template marked optional, only named people who
 * can actually be assigned, and kept offsets inside a sane window.
 *
 * A single violation rejects the entire response: partial application of a
 * response we already know is wrong is how a plan quietly loses a required
 * task. The caller keeps the deterministic draft and tells the manager
 * nothing changed.
 */
export function validatePlannerDelta(
  delta: PlannerAiDelta,
  tasks: PlannerValidationTask[],
  memberUserIds: string[]
): { ok: true } | { ok: false; error: string } {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const members = new Set(memberUserIds);

  for (const drop of delta.drops) {
    const task = byId.get(drop.id);
    if (!task) {
      return { ok: false, error: `drops references unknown task: ${drop.id}` };
    }
    if (!task.optional) {
      return { ok: false, error: `drops references a required task: ${drop.id}` };
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
 * Fold a validated delta into a draft.
 *
 * `phaseScope` limits the fold to one phase, which is what "Regenerate this
 * phase" needs. Rows the manager edited by hand, and rows the manager added,
 * are never touched either way: regenerating must not quietly undo someone's
 * work.
 */
export function applyDeltaToDraft(
  doc: ReleasePlanDraftDoc,
  delta: PlannerAiDelta,
  options: { phaseScope?: PlanPhase } = {}
): ReleasePlanDraftDoc {
  const { phaseScope } = options;

  const dropReasons = new Map(delta.drops.map((d) => [d.id, d.reason]));
  const offsets = new Map(delta.adjust_offsets.map((a) => [a.id, a]));
  const whys = new Map(delta.rewrite_why.map((r) => [r.id, r.why]));
  const roleToMember = new Map(delta.role_assignments.map((a) => [a.role, a.member_user_id]));

  const tasks = doc.tasks.map((task) => {
    if (task.origin !== 'template' || task.edited) return task;
    if (phaseScope && task.phase !== phaseScope) return task;

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
    ...doc,
    ai: { applied: true, rationale: delta.rationale || null, failure: null, warnings: delta.warnings },
    tasks,
  };
}

/**
 * Stamp lib/task-owners.ts's per-task owner proposals onto a fresh draft,
 * before the model is ever called (see generatePlanDraft in
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

/**
 * Reset one phase's template rows back to the template, keeping the manager's
 * own rows and edits. Used before re-folding a fresh delta for that phase, so
 * a regenerate is a clean second attempt rather than an edit on top of an edit.
 */
export function resetPhaseToTemplate(
  doc: ReleasePlanDraftDoc,
  template: Template,
  phase: PlanPhase,
  ownerUserId: string
): ReleasePlanDraftDoc {
  const templateById = new Map(template.tasks.map((task) => [task.id, task]));

  const tasks = doc.tasks.map((task) => {
    if (task.origin !== 'template' || task.edited) return task;
    if (task.phase !== phase) return task;

    const source = templateById.get(task.template_task_id || task.id);
    if (!source) return task;
    if (derivePlanPhase(source.offset_days) !== phase) return task;

    return {
      ...task,
      title: source.title,
      why: source.description,
      offset_days: source.offset_days,
      phase,
      duration_days: source.duration_days,
      role: source.role,
      assignee_user_id: ownerUserId,
      optional: source.optional,
      task_type: source.type,
      tags: source.tags ?? [],
      removed: false,
      removed_by: null,
      removed_reason: null,
      change_reason: null,
      assignee_basis: null,
    } satisfies DraftTask;
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
 * Validate a whole draft document arriving from the client autosave. The
 * server never trusts the client's phases (they are recomputed) and never
 * trusts a template provenance id it cannot find in the named template.
 *
 * Assignees are deliberately NOT checked against workspace membership here.
 * Membership can change while a draft sits open, and blocking an autosave over
 * it would lose the manager's typing. Approval is where assignees are settled.
 */
export function parseDraftDoc(
  value: unknown,
  options: { knownTemplateTaskIds?: Set<string> } = {}
): { ok: true; doc: ReleasePlanDraftDoc } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') {
    return { ok: false, error: 'doc must be an object.' };
  }
  const record = value as Record<string, unknown>;

  if (record.schema_version !== PLAN_DRAFT_SCHEMA_VERSION) {
    return { ok: false, error: 'This plan draft is from an older version. Start a new one.' };
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
      removed_by: t.removed_by === 'ai' || t.removed_by === 'user' ? t.removed_by : null,
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
 * single generation), and the review scene shows both together.
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
  if (intake.goal_text) lines.push(`- Goal in their words: ${intake.goal_text}`);
  if (intake.extra_notes) lines.push(`- Anything else they said: ${intake.extra_notes}`);
  return lines;
}

const OUTPUT_SCHEMA_BLOCK = [
  'Output schema:',
  '{',
  '  "drops": [{ "id": "<task id>", "reason": "<one short line>" }],',
  '  "adjust_offsets": [{ "id": "<task id>", "offset_days": <integer>, "reason": "<one short line, optional>" }],',
  '  "role_assignments": [{ "role": "<role>", "member_user_id": "<member user_id>" }],',
  '  "rewrite_why": [{ "id": "<task id>", "why": "<one short line>" }],',
  '  "warnings": ["<one short line for the manager, at most 5>"],',
  '  "rationale": "<2-3 sentences for the manager>"',
  '}',
].join('\n');

function buildSystemPrompt(scope: { phaseLabel?: string }): string {
  return [
    'You are UrgAns, tailoring a music release rollout plan that was already built from a hand-crafted playbook. You adjust that plan. You never write a new one.',
    '',
    'Voice: you are strict and a little bossy, and a creative at heart — you exist to get this rollout out on time, and it shows in how you write. Every text field you write (the "reason" on a drop, "warnings", the "why" lines, and "rationale") is read by the manager as coming from you: direct, specific to THIS rollout (use the artist, the date, what is and is not ready — never generic filler), and pushing toward action rather than just describing the plan. No hedging ("might", "could consider"). Say what matters and why it matters now.',
    '',
    'Rules:',
    '- You cannot add tasks. There is no operation for it. The manager adds anything the playbook is missing.',
    '- Only drop a task when its "optional" field is true. NEVER drop a task whose "optional" is false.',
    '- Every drop needs a "reason": one short line explaining why, shown to the manager next to it. Never drop a task with no reason.',
    '- Be conservative about the STRUCTURE of the plan (dates, drops, assignments). When in doubt, keep the task and leave its date alone. Being conservative does not mean being bland in the text fields — those should read like you actually looked at this rollout.',
    '- A task landing before today is never by itself a reason to drop it or move it. It stays in the plan; the product shows it under "Catch up".',
    '- Every id you return MUST be copied verbatim from the task list provided. Never invent an id.',
    '- Only assign people from the team list provided, using their exact member_user_id.',
    '- Rewrite a "why" line only when this rollout\'s context genuinely changes it. Keep each rewrite under 160 characters, plain and specific. Leave the rest alone.',
    '- offset_days is days relative to release day. Negative is before, 0 is release day, positive is after.',
    '- Use "warnings" for anything worth the manager\'s attention before approving — a real schedule risk, an assumption you made. Not a reason to change a task by itself. At most 5, each one short line.',
    scope.phaseLabel
      ? `- You are only adjusting the "${scope.phaseLabel}" phase. Every id you return must come from the list below, which is that phase only.`
      : '- Adjust across the whole plan.',
    '- Return ONLY valid JSON matching the schema below. No prose, no markdown, no text outside the JSON object — and inside the string VALUES themselves, still no markdown syntax (no **asterisks**, no # headers): they render as plain text on screen, so asterisks would show up literally.',
    '',
    OUTPUT_SCHEMA_BLOCK,
  ].join('\n');
}

function buildGuidance(
  intake: ReleasePlanIntake,
  options?: { fallbackToSingle?: boolean }
): string {
  const lines = ['Guidance for common cases:'];

  // A one-tap "Draft the plan" (buildAutoIntake) leaves both of these
  // 'unknown' rather than asking. Telling the model "no budget: drop paid
  // promo" here would otherwise fire on every such draft, since 'unknown'
  // reads the same as 'none' to a model that is not told the difference.
  if (intake.goal === 'unknown' && intake.budget === 'unknown') {
    lines.push(
      '- The manager has not stated a goal or a budget for this rollout. Do not assume either: never drop the paid-promotion tasks for a budget that was not stated, and never assume this rollout has more or less budget than the playbook already assumes.'
    );
  } else {
    lines.push('- No budget: drop the optional paid promotion tasks and say so in the rationale.');
  }

  lines.push(
    '- The distributor is already set up: the setup tasks can move later or drop if they are optional.',
    '- Nothing is ready yet: leave the asset production runway exactly as the playbook has it.',
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
 */
export function buildPlannerMessages(params: {
  release: { title: string; artistName: string; releaseDate: string | null };
  intake: ReleasePlanIntake;
  tasks: PlannerPromptTask[];
  members: PlannerPromptMember[];
  todayYmd: string;
  phase?: PlanPhase;
  /** True when this draft came from the single playbook despite being an EP or
   * album — i.e. that format's playbook exists but is switched off. Changes one
   * guidance line, so the prompt never claims a provenance it does not have. */
  fallbackToSingle?: boolean;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const { release, intake, tasks, members, todayYmd, phase, fallbackToSingle } = params;

  const system = buildSystemPrompt({
    phaseLabel: phase ? PLAN_PHASE_LABELS[phase] : undefined,
  });

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
    buildGuidance(intake, { fallbackToSingle }),
    '',
    'Team available for assignment (use member_user_id verbatim):',
    JSON.stringify(members, null, 2),
    '',
    phase
      ? `Tasks in the "${PLAN_PHASE_LABELS[phase]}" phase (only these ids may appear in your response):`
      : 'Current plan (only these ids may appear in your response):',
    JSON.stringify(tasks, null, 2),
    '',
    'Return the JSON now.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
