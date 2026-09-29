import type { Task, TaskStatus } from '@/types/tasks';
import { getTaskSectionKey } from '@/lib/tasks';
import { daysUntilDate, isTaskLate } from './state';
import type { HomeTaskItem, HomeWaitingTask, HomeYourTasks } from './types';

/** Same override shape getTaskSectionKey itself accepts — the ~1.5s "stay in
 * the old bucket" beat after a tick. Optional and defaulted to undefined
 * everywhere below, so server-side calls (which have no store to read this
 * from) behave exactly as before. */
type PendingCompletionIds = ReadonlySet<string> | Record<string, TaskStatus | true>;

export type ReleaseLookupEntry = { title: string; artistName: string };

/**
 * `assignerName` is always null for now: recording who assigned a task needs
 * a migration (tasks.assigned_by_user_id, deferred to step 4 in the approved
 * plan) that has not been built. Manager's own task rows never read this
 * field — they show "Release · Artist" — so nothing built in step 2 is
 * missing anything; it's kept null rather than guessed so a later real value
 * isn't shadowed by an invented one.
 */
function toHomeTaskItem(task: Task, releaseLookup: ReadonlyMap<string, ReleaseLookupEntry>): HomeTaskItem {
  const release = task.releaseId ? releaseLookup.get(task.releaseId) : undefined;
  return {
    id: task.id,
    title: task.title,
    releaseId: task.releaseId,
    releaseTitle: release?.title ?? null,
    artistName: release?.artistName ?? null,
    dueDate: task.dueDate,
    status: task.status,
    priority: task.priority,
    assigneeName: task.assignee?.name ?? null,
    assignerName: null,
  };
}

/**
 * "Your tasks": everything assigned to the viewer, bucketed exactly the way
 * the catalog buckets it (via getTaskSectionKey) so the two screens can never
 * disagree about what's late, due today, or due this week. Any task whose
 * section is something other than overdue/today/week (in_progress, blocked,
 * done, no_due_date, ...) is simply not one of these three lists — this is
 * "what needs you right now", not the whole worklist.
 */
export function buildYourTasks(
  tasks: readonly Task[],
  viewerId: string,
  releaseLookup: ReadonlyMap<string, ReleaseLookupEntry>,
  now: Date = new Date(),
  pendingCompletionIds?: PendingCompletionIds
): HomeYourTasks {
  const late: HomeTaskItem[] = [];
  const today: HomeTaskItem[] = [];
  const week: HomeTaskItem[] = [];

  for (const task of tasks) {
    if (task.assignedToUserId !== viewerId) continue;
    const section = getTaskSectionKey(task, now, pendingCompletionIds);
    if (section === 'overdue') late.push(toHomeTaskItem(task, releaseLookup));
    else if (section === 'today') today.push(toHomeTaskItem(task, releaseLookup));
    else if (section === 'week') week.push(toHomeTaskItem(task, releaseLookup));
  }

  return { late, today, week };
}

/**
 * "Waiting on others": late work assigned to someone other than the viewer,
 * on releases the viewer actually runs — never every release they can merely
 * SEE (a member of several teams should not be told they're "waiting on"
 * someone on a release that belongs to a team they don't run). Returns only
 * the task half; DJ-link waits are assembled server-side (lib/home-server.ts)
 * from data the client stores don't hold, and merged with this at the call
 * site into the full HomeWaiting shape.
 */
export function buildWaitingOnOthers(
  tasks: readonly Task[],
  viewerId: string,
  releaseIdsYouRun: ReadonlySet<string>,
  releaseLookup: ReadonlyMap<string, ReleaseLookupEntry>,
  now: Date = new Date()
): { tasks: HomeWaitingTask[]; onTimeCount: number } {
  const late: HomeWaitingTask[] = [];
  let onTimeCount = 0;

  for (const task of tasks) {
    if (!task.releaseId || !releaseIdsYouRun.has(task.releaseId)) continue;
    if (!task.assignedToUserId || task.assignedToUserId === viewerId) continue;
    if (task.status === 'done' || task.status === 'cancelled') continue;

    if (isTaskLate(task, now)) {
      const daysOut = daysUntilDate(task.dueDate, now) ?? 0;
      late.push({ ...toHomeTaskItem(task, releaseLookup), daysLate: Math.max(1, -daysOut) });
    } else {
      onTimeCount += 1;
    }
  }

  return { tasks: late, onTimeCount };
}
