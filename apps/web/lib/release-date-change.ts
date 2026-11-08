/**
 * What the Change release date sheet says before you save (#1128, founder
 * approved mock, Nov 8, 2026).
 *
 * The preview is worked out on the client from the plan already on screen,
 * through the SAME planActivityShift the schedule route uses to move the plan
 * (lib/release-plan-dates-server.ts), so the sheet cannot promise a move the
 * save will not make: open activities a playbook or the planner wrote move by
 * the difference; done ones and ones a person added stay put.
 *
 * Pure, no React, so vitest holds it.
 */

import { planActivityShift, type PlanDateTask } from './plan-dates';

export type DateChangePreview = {
  headline: string;
  /** What stays where it is, or null when nothing is kept. */
  detail: string | null;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function describeDateChange(
  tasks: readonly PlanDateTask[],
  fromDate: string | null | undefined,
  toDate: string | null | undefined
): DateChangePreview | null {
  const from = (fromDate ?? '').slice(0, 10);
  const to = (toDate ?? '').slice(0, 10);
  if (!YMD.test(from) || !YMD.test(to) || from === to) return null;

  const shift = planActivityShift(tasks, from, to);
  if (shift.deltaDays === 0) return null;

  const days = plural(Math.abs(shift.deltaDays), 'day', 'days');
  const way = shift.deltaDays > 0 ? 'later' : 'earlier';
  const headline =
    shift.movingCount > 0
      ? `${plural(shift.movingCount, 'activity moves', 'activities move')} ${days} ${way}.`
      : 'Nothing in the plan moves.';

  const kept: string[] = [];
  if (shift.keptDone > 0) kept.push(`${shift.keptDone} done`);
  if (shift.keptManual > 0) kept.push(`${shift.keptManual} you added yourself`);
  const keptCount = shift.keptDone + shift.keptManual;
  const detail =
    kept.length > 0
      ? `${kept.join(' and ')} ${keptCount === 1 ? 'stays where it is' : 'stay where they are'}.`
      : null;

  return { headline, detail };
}

/**
 * The earliest day the date field offers. Today, while release day is still
 * ahead. Once the rollout has dropped there is no floor, so a manager can fix
 * a date that was entered wrong (the route has always accepted past days).
 */
export function earliestPickableDay(currentDate: string | null | undefined, todayYmd: string): string | null {
  const current = (currentDate ?? '').slice(0, 10);
  if (YMD.test(current) && current < todayYmd) return null;
  return todayYmd;
}
