// Tasks on Home, on a computer (#1182, mock docs/mocks/home-tighter, note 7):
// "My tasks" is the open work assigned to the viewer, "Delegated" is the open
// work the viewer gave to someone else. Both read whatever tasks the viewer
// can already see (the task store, filled through the usual access rules), so
// nothing here widens what anyone sees. Pure: today is passed in.

import { lagosToday } from '@/lib/next-records';
import { isTaskClosed } from '@/types/tasks';

export const HOME_TASK_LIMIT = 5;

const DAY_MS = 86_400_000;

export type HomeTaskInput = {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  completedAt: string | null;
  createdBy: string;
  assignedToUserId: string | null;
  releaseId: string | null;
};

export type HomeTaskRow<T extends HomeTaskInput = HomeTaskInput> = {
  id: string;
  task: T;
  late: boolean;
  /** Delegated only: finished today, shown under the open ones. */
  doneToday: boolean;
};

export type HomeTaskPick<T extends HomeTaskInput = HomeTaskInput> = {
  /** Every open task that matched, not just the rows shown. */
  open: number;
  rows: HomeTaskRow<T>[];
};

const dayOf = (value: string | null): string | null => {
  if (!value) return null;
  const day = value.slice(0, 10);
  return Number.isFinite(Date.parse(`${day}T00:00:00Z`)) ? day : null;
};

const isOpen = (task: HomeTaskInput) => task.status !== 'done' && !isTaskClosed(task.status);

/** Late first (oldest first), then soonest, then no date; title breaks ties. */
function byUrgency(a: HomeTaskInput, b: HomeTaskInput): number {
  const dayA = dayOf(a.dueDate);
  const dayB = dayOf(b.dueDate);
  if (dayA && dayB) return dayA.localeCompare(dayB) || a.title.localeCompare(b.title);
  if (dayA) return -1;
  if (dayB) return 1;
  return a.title.localeCompare(b.title);
}

function toRows<T extends HomeTaskInput>(open: T[], today: string): HomeTaskRow<T>[] {
  return [...open].sort(byUrgency).map((task) => {
    const day = dayOf(task.dueDate);
    return { id: task.id, task, late: Boolean(day && day < today), doneToday: false };
  });
}

/** Open tasks assigned to the viewer, across every rollout they can see. */
export function selectMyTasks<T extends HomeTaskInput>(tasks: readonly T[], viewerId: string, today: string): HomeTaskPick<T> {
  if (!viewerId) return { open: 0, rows: [] };
  const open = tasks.filter((task) => task.assignedToUserId === viewerId && isOpen(task));
  return { open: open.length, rows: toRows(open, today).slice(0, HOME_TASK_LIMIT) };
}

/**
 * Open tasks someone else holds that the viewer handed out: ones the viewer
 * made, and ones on a rollout the viewer owns (a plan's own tasks are made by
 * the planner, so "made by" alone would miss most of an owner's delegating).
 * Spare rows show what was finished today, so a hand-off is seen landing.
 */
export function selectDelegated<T extends HomeTaskInput>(
  tasks: readonly T[],
  viewerId: string,
  ownedReleaseIds: ReadonlySet<string>,
  today: string
): HomeTaskPick<T> {
  if (!viewerId) return { open: 0, rows: [] };
  const handedOut = tasks.filter(
    (task) =>
      Boolean(task.assignedToUserId) &&
      task.assignedToUserId !== viewerId &&
      (task.createdBy === viewerId || (task.releaseId !== null && ownedReleaseIds.has(task.releaseId)))
  );
  const open = handedOut.filter(isOpen);
  const rows = toRows(open, today).slice(0, HOME_TASK_LIMIT);
  if (rows.length < HOME_TASK_LIMIT) {
    const doneToday = handedOut
      .filter((task) => {
        if (task.status !== 'done' || !task.completedAt) return false;
        const at = new Date(task.completedAt);
        return !Number.isNaN(at.getTime()) && lagosToday(at) === today;
      })
      .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    for (const task of doneToday.slice(0, HOME_TASK_LIMIT - rows.length)) {
      rows.push({ id: task.id, task, late: false, doneToday: true });
    }
  }
  return { open: open.length, rows };
}

/** "6 days late", "Today", "Tomorrow", "Thu 12 Nov", or "No date". */
export function homeDueLabel(dueDate: string | null, today: string): { text: string; late: boolean } {
  const day = dayOf(dueDate);
  if (!day) return { text: 'No date', late: false };
  const gap = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  if (gap < 0) return { text: `${-gap} ${gap === -1 ? 'day' : 'days'} late`, late: true };
  if (gap === 0) return { text: 'Today', late: false };
  if (gap === 1) return { text: 'Tomorrow', late: false };
  const text = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${day}T00:00:00Z`))
    .replace(',', '');
  return { text, late: false };
}
