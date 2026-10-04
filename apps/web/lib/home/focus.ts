import type { HomeTaskItem, HomeYourTasks } from './types';

/**
 * "Do this first": the one task Home puts under the greeting. A manager with 111
 * late tasks does not need the list again, they need a single place to start.
 *
 * The pick is the first non-empty group of late, then due today, then this week.
 * Inside a group, the highest priority wins, then the oldest due date (the one
 * that has waited longest), then the title so the answer never flips between
 * renders. Pure so the rule can be tested.
 */
export type FocusTask = {
  task: HomeTaskItem;
  group: 'late' | 'today' | 'week';
  /** How many tasks sit in the same group, so the card can say "1 of 111". */
  groupSize: number;
};

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

function compare(a: HomeTaskItem, b: HomeTaskItem): number {
  const byPriority = (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
  if (byPriority !== 0) return byPriority;
  const aDue = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
  const bDue = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue < bDue ? -1 : 1;
  return a.title.localeCompare(b.title);
}

export function pickFocusTask(yourTasks: HomeYourTasks): FocusTask | null {
  const groups = [
    ['late', yourTasks.late],
    ['today', yourTasks.today],
    ['week', yourTasks.week],
  ] as const;
  for (const [group, tasks] of groups) {
    if (tasks.length === 0) continue;
    const [task] = [...tasks].sort(compare);
    return { task, group, groupSize: tasks.length };
  }
  return null;
}

/** The same tasks with the focus one taken out, so the list below never repeats it. */
export function withoutTask(yourTasks: HomeYourTasks, taskId: string | null): HomeYourTasks {
  if (!taskId) return yourTasks;
  const keep = (tasks: HomeTaskItem[]) => tasks.filter((task) => task.id !== taskId);
  return { late: keep(yourTasks.late), today: keep(yourTasks.today), week: keep(yourTasks.week) };
}
