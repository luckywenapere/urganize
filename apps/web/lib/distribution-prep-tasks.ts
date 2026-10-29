// The check before distribution as ordinary plan tasks (2026-10-29, founder
// call, #851). The checklist card that read "Before you order distribution 0
// of 7" is gone: the work it asked for is three tasks in the plan, in the weeks
// they belong to, that tick themselves when the check passes.
//
// Three traps this module handles, each with a test:
//
//  - THE PLANNER REFUSES A ROLLOUT WITH GENERATED TASKS, so these are written
//    with auto_generated = false (the pre-production seed's precedent), and
//    the plan is still built on top once a release date is set.
//  - "NO PLAN YET" IS READ AS "EVERY TASK IS PRE-PRODUCTION"
//    (onlyPreProductionWork), so on a rollout with no plan these carry the
//    pre-production phase and the "make the plan" prompt still shows. They move
//    to their real phase once a plan exists.
//  - THE SCHEDULE ROUTE ONLY MOVES GENERATED TASKS, so these follow release
//    day themselves: each remembers the date it was given and the release date
//    it was worked out from, and is moved only while nobody has changed it.
//
// Pure: the reads and writes are in lib/distribution-prep-tasks-server.ts.

import { presenceDay } from './presence';
import { dayNumber, formatDay } from './lagos-day';
import { rolloutPhaseForOffset, type RolloutPhase } from './rollout-phases';
import type { DistributionIssueCode } from './distribution-rules';

export type DistributionPrepTask = {
  /** Stored at tasks.metadata.template.task_id, like a playbook step. */
  stepId: string;
  title: string;
  description: string;
  /** The task is done when none of these is raised by the check. */
  codes: readonly DistributionIssueCode[];
  /** Days from release day, the same scale as a playbook offset. Week 7 for the
   *  details beside "Write song metadata", week 6 for the artwork beside "Cover
   *  art final approved", both before the plan's upload to the distributor. */
  offsetDays: number;
  tags: readonly string[];
};

export const DISTRIBUTION_PREP_TASKS: readonly DistributionPrepTask[] = [
  {
    stepId: 'dist_prep_details',
    title: 'Set the genre, lyrics language and explicit tag',
    description: 'The stores ask for all three before they take the release. Fill them in on the release details.',
    codes: ['missing_genre', 'missing_language', 'missing_explicit_flag'],
    offsetDays: -49,
    tags: ['distribution', 'planning'],
  },
  {
    stepId: 'dist_prep_credits',
    title: 'Add the songwriters to the credits',
    description:
      'Every release needs at least one songwriter, composer or lyricist credited before it goes to the stores.',
    codes: ['missing_songwriter_credits'],
    offsetDays: -49,
    tags: ['distribution', 'planning'],
  },
  {
    stepId: 'dist_prep_artwork',
    title: 'Upload the final cover art (3000 x 3000, JPG or PNG)',
    description: 'The stores take square artwork at least 3000 x 3000 px, as a JPG or PNG.',
    codes: ['artwork_missing', 'artwork_not_square', 'artwork_too_small', 'artwork_wrong_format'],
    offsetDays: -42,
    tags: ['distribution', 'asset_production'],
  },
];

const STEP_IDS: ReadonlySet<string> = new Set(DISTRIBUTION_PREP_TASKS.map((def) => def.stepId));

export function isDistributionPrepStep(stepId: string | null | undefined): boolean {
  return Boolean(stepId) && STEP_IDS.has(stepId as string);
}

/** tasks.metadata key holding what this module last set on the task. */
export const PREP_TASK_METADATA_KEY = 'distribution_prep';

/** What this module last wrote on a task: the due date, and the release date it
 *  came from. A due date that no longer matches was changed by a person. */
export type PrepAutoRecord = { due: string | null; releaseDate: string | null };

export function readPrepAutoRecord(metadata: unknown): PrepAutoRecord | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const record = (metadata as Record<string, unknown>)[PREP_TASK_METADATA_KEY];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const { due, releaseDate } = record as Record<string, unknown>;
  return {
    due: typeof due === 'string' ? due : null,
    releaseDate: typeof releaseDate === 'string' ? releaseDate : null,
  };
}

function releaseDay(releaseDate: string | null | undefined): string | null {
  const day = dayNumber(releaseDate);
  return day === null ? null : formatDay(day);
}

/**
 * Release day plus the offset, as the UTC-midnight timestamp playbook rows
 * carry. A day that has already gone is today, so a late plan reads "due today"
 * rather than overdue on arrival. Null with no release date.
 */
export function prepDueDate(releaseDate: string | null | undefined, offsetDays: number, now: Date): string | null {
  const release = dayNumber(releaseDate);
  const today = dayNumber(presenceDay(now));
  if (release === null || today === null) return null;
  return `${formatDay(Math.max(release + offsetDays, today))}T00:00:00.000Z`;
}

export type PrepExistingTask = {
  id: string;
  stepId: string;
  status: string;
  dueDate: string | null;
  phase: RolloutPhase | null;
  auto: PrepAutoRecord | null;
};

export type PrepWrite = { dueDate: string | null; phase: RolloutPhase; auto: PrepAutoRecord };

export type PrepPlan = {
  insert: Array<{ def: DistributionPrepTask } & PrepWrite>;
  /** Open tasks whose check now passes. */
  tick: string[];
  update: Array<{ id: string } & Partial<PrepWrite>>;
};

const sameDay = (a: string | null, b: string | null) => (a ?? '').slice(0, 10) === (b ?? '').slice(0, 10);

/**
 * What to change on one rollout. `added` is the list of steps ever added to it
 * (kept on the release), so a task the team deleted is not put back. A task is
 * only added while its work is still to do. `hasPlan` is whether the rollout has
 * work beyond pre-production, the same test the screen uses.
 */
export function planDistributionPrep(input: {
  releaseDate: string | null | undefined;
  now: Date;
  hasPlan: boolean;
  openCodes: readonly DistributionIssueCode[];
  existing: readonly PrepExistingTask[];
  added: readonly string[];
}): PrepPlan {
  const open = new Set(input.openCodes);
  const day = releaseDay(input.releaseDate);
  const plan: PrepPlan = { insert: [], tick: [], update: [] };

  for (const def of DISTRIBUTION_PREP_TASKS) {
    const stillToDo = def.codes.some((code) => open.has(code));
    const dueDate = prepDueDate(day, def.offsetDays, input.now);
    const phase: RolloutPhase = input.hasPlan ? rolloutPhaseForOffset(def.offsetDays) : 'pre_production';
    const rows = input.existing.filter((row) => row.stepId === def.stepId);

    if (rows.length === 0) {
      if (stillToDo && !input.added.includes(def.stepId)) {
        plan.insert.push({ def, dueDate, phase, auto: { due: dueDate, releaseDate: day } });
      }
      continue;
    }

    for (const row of rows) {
      if (row.status === 'done' || row.status === 'cancelled') continue;
      if (!stillToDo) {
        plan.tick.push(row.id);
        continue;
      }
      const change: { id: string } & Partial<PrepWrite> = { id: row.id };
      // Follow release day, but only while the date is still the one we set.
      const untouched = row.auto ? sameDay(row.dueDate, row.auto.due) : row.dueDate === null;
      const releaseMoved = (row.auto?.releaseDate ?? null) !== day;
      if (untouched && releaseMoved) {
        change.dueDate = dueDate;
        change.auto = { due: dueDate, releaseDate: day };
      }
      // Out of pre-production once there is a plan; never back into it.
      if (input.hasPlan && row.phase === 'pre_production') change.phase = phase;
      if (Object.keys(change).length > 1) plan.update.push(change);
    }
  }

  return plan;
}

const COVERED_CODES: ReadonlySet<DistributionIssueCode> = new Set([
  ...DISTRIBUTION_PREP_TASKS.flatMap((def) => def.codes),
  // An undated rollout says so on its own header, and its tasks wait for a date.
  'missing_release_date',
]);

/**
 * What the rollout still shows as a line once the tasks carry the rest: the
 * warnings (a date that is tight, splits that do not add up), plus any error no
 * task covers. Generic over the issue so the browser can pass its own rows.
 */
export function issuesLeftOnRollout<T extends { code: DistributionIssueCode }>(check: {
  errors: readonly T[];
  warnings: readonly T[];
}): { errors: T[]; warnings: T[] } {
  return {
    errors: check.errors.filter((issue) => !COVERED_CODES.has(issue.code)),
    warnings: [...check.warnings],
  };
}
