/**
 * Rollout phases (URG-292): Pre-release, Release and Post-release.
 *
 * A manager's first question about a rollout is "where are we?", and the
 * answer they think in is one of three words: still building up to it, in the
 * release week, or keeping it alive afterwards. This module is the one place
 * that says which of the three a task belongs to, and what each phase adds up
 * to (dates and progress), so the activity list and the timeline group alike.
 *
 * WHERE THE PHASE COMES FROM, in order:
 *
 *  1. `metadata.phase` on the task row, when one is stored. The playbooks
 *     (lib/release-templates/instantiate.ts) and approved plans
 *     (lib/release-planning-server.ts) write it at creation, and a person can
 *     change it in the task detail. It is metadata rather than a column for
 *     the same reason `metadata.planner.key` is: no migration, nothing to
 *     backfill, and the PATCH route merges it without exposing the whole
 *     metadata object.
 *  2. Otherwise the task's date relative to release day. This is how every
 *     task that existed before this shipped gets a sensible phase, with no
 *     backfill: the answer is computed on read, so it is always current.
 *  3. A task with neither (no stored phase, no date) is prep work someone
 *     wrote down without a date yet, so it reads as Pre-release.
 *
 * THE BOUNDARIES are derivePlanPhase's, collapsed from four to three: its
 * Setup and Pre-release both become Pre-release, Release week becomes Release
 * (7 days either side of release day), and Post-release stays. So the plan
 * review, the "next phase" nudge and these headers can never disagree about
 * where the release week starts.
 */

import { derivePlanPhase, type PlanPhase } from './release-planning';
import { ROLLOUT_PHASE_OPTIONS, type RolloutPhase } from '@/types/tasks';

export type { RolloutPhase };

export const ROLLOUT_PHASE_ORDER: readonly RolloutPhase[] = ROLLOUT_PHASE_OPTIONS;

export const ROLLOUT_PHASE_LABELS: Record<RolloutPhase, string> = {
  pre_release: 'Pre-release',
  release: 'Release',
  post_release: 'Post-release',
};

export const ROLLOUT_PHASE_BLURBS: Record<RolloutPhase, string> = {
  pre_release: 'Getting the music, the art and the marketing ready.',
  release: 'Release day and the week either side of it.',
  post_release: 'Keeping it alive after release day.',
};

/** First and last day offsets (inclusive) of the Release phase. */
export const RELEASE_PHASE_FIRST_DAY = -7;
export const RELEASE_PHASE_LAST_DAY = 7;

const MS_PER_DAY = 86_400_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

export function isRolloutPhase(value: unknown): value is RolloutPhase {
  return typeof value === 'string' && (ROLLOUT_PHASE_OPTIONS as readonly string[]).includes(value);
}

/** The four plan phases folded into the three rollout phases. */
export function rolloutPhaseForPlanPhase(phase: PlanPhase): RolloutPhase {
  if (phase === 'release_week') return 'release';
  if (phase === 'post_release') return 'post_release';
  return 'pre_release';
}

/** Which phase a day offset from release day falls in. */
export function rolloutPhaseForOffset(offsetDays: number): RolloutPhase {
  return rolloutPhaseForPlanPhase(derivePlanPhase(offsetDays));
}

/** Read the phase stored at `metadata.phase`. */
export function readTaskPhase(metadata: unknown): RolloutPhase | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const phase = (metadata as { phase?: unknown }).phase;
  return isRolloutPhase(phase) ? phase : null;
}

/** Metadata with `phase` set (or removed, for null), everything else kept. */
export function withTaskPhase(metadata: unknown, phase: RolloutPhase | null): Record<string, unknown> {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  if (phase === null) {
    delete base.phase;
    return base;
  }
  return { ...base, phase };
}

// ---------------------------------------------------------------------------
// Dates (UTC calendar days, the same frame as lib/release-timeline.ts)
// ---------------------------------------------------------------------------

function utcMidnight(value: string | null | undefined): number | null {
  if (!value || !ISO_DATE_PATTERN.test(value)) return null;
  const epoch = Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)));
  return Number.isNaN(epoch) ? null : epoch;
}

/** Whole days from release day to `value`; negative is before. */
export function offsetFromRelease(value: string | null | undefined, releaseDate: string | null | undefined): number | null {
  const release = utcMidnight(releaseDate);
  const day = utcMidnight(value);
  if (release === null || day === null) return null;
  return Math.round((day - release) / MS_PER_DAY);
}

function isoForOffset(releaseDate: string, offset: number): string | null {
  const release = utcMidnight(releaseDate);
  if (release === null) return null;
  return new Date(release + offset * MS_PER_DAY).toISOString().slice(0, 10);
}

type PhaseTask = { phase?: RolloutPhase | null; dueDate: string | null };

/** The phase a task shows under: stored, else from its date, else Pre-release. */
export function resolveTaskPhase(task: PhaseTask, releaseDate: string | null | undefined): RolloutPhase {
  if (isRolloutPhase(task.phase)) return task.phase;
  const offset = offsetFromRelease(task.dueDate, releaseDate);
  if (offset !== null) return rolloutPhaseForOffset(offset);
  return 'pre_release';
}

/** Tasks split by phase, every phase present (possibly empty), order kept. */
export function groupTasksByRolloutPhase<T extends PhaseTask>(
  tasks: readonly T[],
  releaseDate: string | null | undefined
): Record<RolloutPhase, T[]> {
  const grouped: Record<RolloutPhase, T[]> = { pre_release: [], release: [], post_release: [] };
  for (const task of tasks) grouped[resolveTaskPhase(task, releaseDate)].push(task);
  return grouped;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Where a phase stands against today:
 *  - done:     every activity in it is finished
 *  - current:  today falls in its window
 *  - past:     its window is behind us but work is still open
 *  - upcoming: its window is still ahead
 *  - unknown:  no release date, so there is no window
 */
export type RolloutPhaseState = 'done' | 'current' | 'past' | 'upcoming' | 'unknown';

export type RolloutPhaseSummary = {
  phase: RolloutPhase;
  label: string;
  /** Activities in the phase, cancelled ones left out. */
  total: number;
  done: number;
  /** 0 to 100, rounded. 0 for an empty phase. */
  percent: number;
  /** First and last date (YYYY-MM-DD) the phase covers: the span of its dated
   * activities, or its nominal window when none are dated. Either can be null
   * (Pre-release has no fixed start, Post-release no fixed end). */
  startDate: string | null;
  endDate: string | null;
  state: RolloutPhaseState;
};

type SummaryTask = PhaseTask & { status: string; durationDays?: number | null };

/** The nominal window of a phase, as day offsets (null = open-ended). */
function nominalWindow(phase: RolloutPhase): { start: number | null; end: number | null } {
  if (phase === 'pre_release') return { start: null, end: RELEASE_PHASE_FIRST_DAY - 1 };
  if (phase === 'release') return { start: RELEASE_PHASE_FIRST_DAY, end: RELEASE_PHASE_LAST_DAY };
  return { start: RELEASE_PHASE_LAST_DAY + 1, end: null };
}

/**
 * The three phases of a rollout with dates and progress. Always returns all
 * three, in order, so the headers do not jump around as work moves.
 */
export function summarizeRolloutPhases(
  tasks: readonly SummaryTask[],
  releaseDate: string | null | undefined,
  now: Date = new Date()
): RolloutPhaseSummary[] {
  const grouped = groupTasksByRolloutPhase(tasks, releaseDate);
  const todayIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
  const todayOffset = offsetFromRelease(todayIso, releaseDate);
  const todayPhaseIndex =
    todayOffset === null ? null : ROLLOUT_PHASE_ORDER.indexOf(rolloutPhaseForOffset(todayOffset));

  return ROLLOUT_PHASE_ORDER.map((phase, index) => {
    const live = grouped[phase].filter((task) => task.status !== 'cancelled');
    const total = live.length;
    const done = live.filter((task) => task.status === 'done').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    let first: number | null = null;
    let last: number | null = null;
    for (const task of live) {
      const start = offsetFromRelease(task.dueDate, releaseDate);
      if (start === null) continue;
      const span = task.durationDays && task.durationDays > 1 ? Math.floor(task.durationDays) : 1;
      const end = start + span - 1;
      if (first === null || start < first) first = start;
      if (last === null || end > last) last = end;
    }
    const nominal = nominalWindow(phase);
    const startOffset = first ?? nominal.start;
    const endOffset = last ?? nominal.end;
    const startDate = releaseDate && startOffset !== null ? isoForOffset(releaseDate, startOffset) : null;
    const endDate = releaseDate && endOffset !== null ? isoForOffset(releaseDate, endOffset) : null;

    let state: RolloutPhaseState;
    if (total > 0 && done === total) state = 'done';
    else if (todayPhaseIndex === null) state = 'unknown';
    else if (index === todayPhaseIndex) state = 'current';
    else if (index < todayPhaseIndex) state = 'past';
    else state = 'upcoming';

    return { phase, label: ROLLOUT_PHASE_LABELS[phase], total, done, percent, startDate, endDate, state };
  });
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function shortDate(iso: string): string {
  const epoch = utcMidnight(iso);
  return epoch === null ? iso : SHORT_DATE.format(new Date(epoch));
}

/** "4 Sep – 12 Oct", "Until 7 Oct", "From 23 Oct", or "" with no dates. */
export function formatPhaseDates(summary: Pick<RolloutPhaseSummary, 'startDate' | 'endDate'>): string {
  const { startDate, endDate } = summary;
  if (startDate && endDate) {
    return startDate === endDate ? shortDate(startDate) : `${shortDate(startDate)} – ${shortDate(endDate)}`;
  }
  if (endDate) return `Until ${shortDate(endDate)}`;
  if (startDate) return `From ${shortDate(startDate)}`;
  return '';
}

/** "Now", "Done", "Still open": the one word on a phase header, or null. */
export function phaseStateLabel(state: RolloutPhaseState): string | null {
  if (state === 'current') return 'Now';
  if (state === 'done') return 'Done';
  if (state === 'past') return 'Still open';
  return null;
}
