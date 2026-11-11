import { daysUntilDue, dueCalendarDay, isClosedStatus, type Task, type TaskStatus } from '@/lib/tasks';

/**
 * The Activities list on a computer (#1203, part of #1175): rows sit in fixed
 * columns (tick, Activity, Kind, Who, Due) under a heading row, so the kind,
 * the person and the date line up down the list. Phones keep the one-line row.
 *
 * One grid for the heading row and every row, so they cannot drift apart.
 * Kind shows from xl (1280): at 1024 it drops first, before a name or a title
 * is cut mid-word. Literal class strings, so Tailwind sees them.
 */
export const ACTIVITY_GRID_CLASS =
  'lg:grid lg:grid-cols-[24px_minmax(0,1fr)_168px_96px] lg:gap-4 xl:grid-cols-[24px_minmax(0,1fr)_200px_168px_96px]';

export type PlainDueTone = 'normal' | 'late' | 'quiet';

/**
 * The Due column in plain words (founder approved mock, 11 Nov 2026): "Today",
 * "Tomorrow" or the date, red only when late, "Done" for finished rows.
 *
 * Late follows getRelativeDueLabel's rule: an activity the plan made already
 * in the past (a short runway) is catch-up work, not slippage, so it is not red.
 */
export function plainDueLabel(
  task: Pick<Task, 'dueDate' | 'completedAt' | 'compressedRunway'> & {
    status?: TaskStatus | string | null;
    relativeWhen?: string | null;
  },
  now: Date = new Date()
): { label: string; tone: PlainDueTone } {
  if (task.status === 'done') return { label: 'Done', tone: 'quiet' };
  if (isClosedStatus(task.status)) return { label: 'Cancelled', tone: 'quiet' };

  const days = daysUntilDue(task.dueDate, now);
  const day = dueCalendarDay(task.dueDate);
  if (days === null || !day) return { label: task.relativeWhen || 'No date', tone: 'quiet' };

  const tone: PlainDueTone = days < 0 && !task.compressedRunway ? 'late' : 'normal';
  if (days === 0) return { label: 'Today', tone };
  if (days === 1) return { label: 'Tomorrow', tone };
  if (days === -1 && tone === 'late') return { label: 'Yesterday', tone };

  const month = day.toLocaleDateString('en-GB', { month: 'short' });
  const year = day.getFullYear() === now.getFullYear() ? '' : ` ${day.getFullYear()}`;
  return { label: `${day.getDate()} ${month}${year}`, tone };
}

/** The words on an empty phase's one line: "Until 5 Nov · nothing planned". */
export function emptyPhaseText(dates: string): string {
  return dates ? `${dates} · nothing planned` : 'Nothing planned';
}
