/**
 * Moving a rollout's release date moves its open activities with it.
 *
 * Pure and import-free (no supabase, no node) so vitest can hold it without
 * any env-var requirement — the `lib/schedule-release-outcome.ts` precedent.
 * `POST /api/releases/[releaseId]/schedule` is the only caller: it reads the
 * OLD date before overwriting it, fetches this release's tasks, and applies
 * whatever this returns.
 *
 * The rule: every OPEN, DATED task moves by exactly the number of days the
 * release date moved. Done work stays exactly where it landed — a shipped
 * activity is a record of when it actually happened, not a placeholder to
 * keep in sync with a date that has since moved.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Statuses whose due date is left untouched by a release-date move. Both
 *  are terminal: the work either happened (on the date it happened) or was
 *  explicitly called off, and neither should be dragged along by a
 *  reschedule of work that is still open. Every other status in
 *  TASK_STATUS_OPTIONS (locked, backlog, todo, in_progress, blocked,
 *  in_review) is still open and moves. */
const UNMOVED_STATUSES = new Set(['done', 'cancelled']);

export type ReschedulableTask = {
  id: string;
  status: string;
  /** ISO timestamp, or null for a task with no due date (moving it would be
   *  moving nothing meaningful). */
  dueDate: string | null;
};

export type TaskDueDateShift = {
  id: string;
  dueDate: string;
};

/**
 * How many whole days a release date moved, or null when either date fails
 * to parse — the caller's cue to skip the shift entirely rather than move
 * every activity by `NaN` days.
 */
export function daysBetweenReleaseDates(
  previousReleaseDate: string,
  nextReleaseDate: string
): number | null {
  const previous = Date.parse(`${previousReleaseDate.slice(0, 10)}T00:00:00.000Z`);
  const next = Date.parse(`${nextReleaseDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(previous) || Number.isNaN(next)) return null;
  return Math.round((next - previous) / MS_PER_DAY);
}

/**
 * The exact set of writes a release-date move implies: one shifted due date
 * per open, dated task, and nothing for a task that is done, cancelled, or
 * has no due date at all to shift.
 *
 * `daysMoved` of 0 (a date "changed" to the same day, or a title-only save
 * that carries the unchanged date) returns no shifts — nothing needs writing,
 * and it is what keeps this a no-op on every ordinary re-save.
 */
export function computeShiftedTaskDueDates(
  tasks: ReschedulableTask[],
  daysMoved: number
): TaskDueDateShift[] {
  if (!daysMoved) return [];

  const shifts: TaskDueDateShift[] = [];
  for (const task of tasks) {
    if (UNMOVED_STATUSES.has(task.status)) continue;
    if (!task.dueDate) continue;

    const ms = Date.parse(task.dueDate);
    if (Number.isNaN(ms)) continue;

    shifts.push({ id: task.id, dueDate: new Date(ms + daysMoved * MS_PER_DAY).toISOString() });
  }
  return shifts;
}
