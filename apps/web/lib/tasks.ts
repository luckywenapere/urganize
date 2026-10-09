import type { ReleaseOption } from '@/lib/release-helpers';
import { PITCH_REMINDER_NOTIFICATION_TYPES, pitchNotificationMessage } from '@/lib/editorial-pitch';

/**
 * Audit findings before building collaborative tasks:
 * 1. Releases are the app's center of gravity. The workspace's scoped view (`/dashboard?release=<id>`) is the active
 *    release workspace (2026-08-04 — absorbed the former `/dashboard/releases/[releaseId]` detail page), with
 *    Metadata, the content calendar, files, press kit, and credits all hanging off a release id.
 * 2. Team structure already exists in two places: owner-led `organizations` + `organization_members` for workspace-ish
 *    settings, and release-specific `release_collaborators` for credits collection. Neither currently powers assignment.
 * 3. There is no in-app notification center yet. The only notification surface today is local preference toggles in
 *    `/settings`, so task notifications need to introduce the first real notification feed.
 * 4. `@urganize/ui` only exposes low-level primitives (Button/Input/Card/Logo/etc.). More advanced patterns such as the
 *    release selector combobox live in app code and can be reused directly.
 * 5. The legacy `ai_tasks` table and old `types/index.ts` task types have been dropped.
 *    The collaborative team task system built here is the canonical task model.
 */

export const DEFAULT_RELEASE_TASK_GROUPS = [
  'PREP',
  'DISTRIBUTION',
  'CONTENT',
  'MARKETING',
  'RELEASE DAY',
  'POST RELEASE',
] as const;

import type { 
  TaskStatus, 
  TaskPriority, 
  TaskRequirement, 
  TaskReleaseSummary,
  Task,
  TaskDetail,
  TaskAttachment,
  TaskComment,
  TaskActivityEntry,
  TaskContextLink,
  TaskNotification,
  TaskSectionKey,
  TaskViewMode,
  TaskSortKey,
  TaskCreateSource,
  TaskRequirementType,
  TaskGroup,
  TaskOutcome,
  TaskOutcomeRating
} from '@/types/tasks';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/types/tasks';
import type { 
  WorkspaceMemberRole, 
  WorkspaceMemberStatus, 
  Workspace, 
  WorkspaceMember 
} from '@/types/auth';
import type { ReleasePipelineState } from '@/types/releases';

export { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS };
export { WORKSPACE_MEMBER_ROLE_OPTIONS, WORKSPACE_MEMBER_STATUS_OPTIONS } from '@/types/auth';

export type { 
  TaskStatus, 
  TaskPriority, 
  WorkspaceMemberRole, 
  WorkspaceMemberStatus, 
  TaskViewMode, 
  TaskSortKey, 
  TaskSectionKey, 
  TaskCreateSource, 
  ReleasePipelineState, 
  TaskRequirementType, 
  TaskRequirement, 
  Workspace, 
  WorkspaceMember, 
  TaskGroup, 
  TaskReleaseSummary, 
  TaskAttachment, 
  TaskComment, 
  TaskActivityEntry, 
  TaskContextLink, 
  Task,
  TaskDetail,
  TaskNotification,
  TaskOutcome,
  TaskOutcomeRating
};

export const NOTIFICATION_TYPE_OPTIONS = [
  'task_assigned',
  'task_commented',
  'task_due_soon',
  'task_due_3d',
  'task_due_7d',
  'task_overdue',
  'task_status_changed',
  ...PITCH_REMINDER_NOTIFICATION_TYPES,
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPE_OPTIONS)[number];
export interface MyTasksResponse {
  sections: Record<TaskSectionKey, Task[]>;
  totals: Record<TaskSectionKey, number>;
}

export interface AllTasksResponse {
  grouped: Array<{
    release: TaskReleaseSummary | null;
    tasks: Task[];
  }>;
}

export interface ReleaseTasksResponse {
  release: TaskReleaseSummary;
  groups: TaskGroup[];
  tasks: Task[];
  members: WorkspaceMember[];
}

export interface WorkspaceMembersResponse {
  workspace: Workspace;
  members: WorkspaceMember[];
}

export interface QuickTaskCreateInput {
  title: string;
  workspaceId?: string | null;
  releaseId?: string | null;
  groupId?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority;
  source: TaskCreateSource;
}

export interface TaskFilters {
  releaseId?: string | null;
  priority?: TaskPriority | '';
  status?: TaskStatus | '';
  sort?: TaskSortKey;
}

export function getTaskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'backlog':
      return 'Backlog';
    case 'locked':
      return 'Locked';
    case 'todo':
      return 'To Do';
    case 'in_progress':
      return 'In Progress';
    case 'blocked':
      return 'Blocked';
    case 'in_review':
      return 'In Review';
    case 'done':
      return 'Done';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Task';
  }
}

export function getTaskPriorityLabel(priority: TaskPriority): string {
  switch (priority) {
    case 'urgent':
      return 'Urgent';
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
    default:
      return 'None';
  }
}

export function getNotificationMessage(notification: TaskNotification): string {
  switch (notification.type) {
    case 'task_assigned':
      return `${notification.actorName} assigned you an activity`;
    case 'task_commented':
      return `${notification.actorName} commented on an activity`;
    case 'task_due_soon':
      return 'An activity is due soon';
    case 'task_due_3d':
      return 'An activity is due in 3 days';
    case 'task_due_7d':
      return 'An activity is due in 7 days';
    case 'task_overdue':
      return 'An activity is overdue';
    case 'task_status_changed':
      return `${notification.actorName} changed an activity's status`;
    case 'pitch_reminder_28d':
    case 'pitch_reminder_14d':
    case 'pitch_reminder_8d':
      return pitchNotificationMessage(
        notification.type,
        { title: notification.taskReleaseTitle, date: notification.taskReleaseDate },
        new Date()
      );
    default:
      return 'Activity update';
  }
}

export function getTaskStatusTone(status: TaskStatus): 'neutral' | 'warning' | 'success' {
  if (status === 'done') {
    return 'success';
  }

  if (status === 'in_review' || status === 'in_progress') {
    return 'warning';
  }

  if (status === 'blocked') {
    return 'warning';
  }

  return 'neutral';
}

export function getPriorityBorderClass(priority: TaskPriority): string {
  switch (priority) {
    case 'urgent':
      return 'border-l-status-error';
    case 'high':
      return 'border-l-status-warning';
    case 'medium':
      return 'border-l-priority-medium';
    case 'low':
      return 'border-l-status-info';
    default:
      return 'border-l-transparent';
  }
}

export function getPriorityDotClass(priority: TaskPriority): string {
  switch (priority) {
    case 'urgent':
      return 'bg-status-error';
    case 'high':
      return 'bg-status-warning';
    case 'medium':
      return 'bg-priority-medium';
    case 'low':
      return 'bg-status-info';
    default:
      return 'bg-priority-none';
  }
}

export function getInitials(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return 'U';
  }

  return parts.map((part) => part[0]?.toUpperCase() || '').join('');
}

export function formatFileSize(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    Boolean(target.isContentEditable)
  );
}

export function sortTasksByPosition(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

/**
 * Every status EXCEPT 'todo' maps to a group of its own. 'todo' is the only
 * status that falls through to the time buckets below, which is what makes
 * "status wins" work: an activity is grouped by the state it's in, and only
 * un-started work is grouped by when it's due.
 */
const STATUS_SECTIONS: Partial<Record<TaskStatus, TaskSectionKey>> = {
  in_progress: 'in_progress',
  blocked: 'blocked',
  in_review: 'in_review',
  backlog: 'backlog',
  locked: 'locked',
  done: 'done',
  cancelled: 'cancelled',
};

/**
 * Bucketing rule (status wins, founder call 2026-08-15):
 *   A task's STATUS decides its section unless the status is 'todo', in which
 *   case its due date does (overdue / catch_up / today / week / upcoming /
 *   no_due_date). 'done' behaved this way already; the other six statuses
 *   joined it, so In Progress / Blocked / In Review / Backlog / Locked /
 *   Cancelled are now peer sections of "Due this week" rather than being
 *   scattered through the time buckets with nothing marking them.
 *
 *   The lone exception is the in-place beat after a tick: while an id is in
 *   `pendingCompletionIds`, the task is placed by its PRE-completion status
 *   (the value the store recorded there) so the row stays put for ~1.5s before
 *   sliding into Done. Passing a Set — or the legacy `true` — falls back to
 *   time placement, which is the old behaviour and still correct for a task
 *   that was 'todo'. The store sets and clears that override; this function is
 *   otherwise pure.
 */
export function getTaskSectionKey(
  task: Task,
  now: Date = new Date(),
  pendingCompletionIds?: ReadonlySet<string> | Record<string, TaskStatus | true>
): TaskSectionKey {
  // `instanceof Set` does NOT narrow the union: `ReadonlySet` is an interface,
  // not a class, so TS can't exclude it from the else branch and refuses to
  // index it. The original code sidestepped this with `hasOwnProperty`; this
  // one needs the VALUE, so the record branch is cast explicitly. Keep the
  // cast if you touch this — the runtime check above it is the real guard.
  const pendingValue: TaskStatus | true | undefined = !pendingCompletionIds
    ? undefined
    : pendingCompletionIds instanceof Set
      ? pendingCompletionIds.has(task.id) || undefined
      : (pendingCompletionIds as Record<string, TaskStatus | true>)[task.id];
  const isPending = Boolean(pendingValue);

  if (isPending) {
    // Mid-beat: place by where the row WAS, not where it just went.
    const previousStatus = typeof pendingValue === 'string' ? pendingValue : undefined;
    const previousSection = previousStatus ? STATUS_SECTIONS[previousStatus] : undefined;
    if (previousSection && previousSection !== 'done') {
      return previousSection;
    }
    // Unknown previous status (or it was 'todo') → fall through to time placement.
  } else {
    const statusSection = STATUS_SECTIONS[task.status];
    if (statusSection) {
      return statusSection;
    }
  }

  if (!task.dueDate) {
    return 'no_due_date';
  }

  const dueDate = new Date(task.dueDate);
  if (Number.isNaN(dueDate.getTime())) {
    return 'no_due_date';
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);

  const differenceInDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (differenceInDays < 0) {
    // Compressed-runway tasks: the template instantiated them with a past
    // due date because the release date was inside the template's lead time.
    // They route to "Catch up" rather than red "Overdue". Completed tasks
    // fall through to overdue so the row reads naturally; the catch_up
    // section is for outstanding catch-up work only.
    if (task.compressedRunway && !task.completedAt) {
      return 'catch_up';
    }
    return 'overdue';
  }

  if (differenceInDays === 0) {
    return 'today';
  }

  if (differenceInDays <= 7) {
    return 'week';
  }

  return 'upcoming';
}

export function getTaskSectionLabel(section: TaskSectionKey): string {
  switch (section) {
    case 'in_progress':
      return 'In Progress';
    case 'blocked':
      return 'Blocked';
    case 'in_review':
      return 'In Review';
    case 'backlog':
      return 'Backlog';
    case 'locked':
      return 'Locked';
    case 'cancelled':
      return 'Cancelled';
    case 'overdue':
      return 'Overdue';
    case 'catch_up':
      return 'Catch Up';
    case 'today':
      return 'Due Today';
    case 'week':
      return 'Due This Week';
    case 'upcoming':
      return 'Upcoming';
    case 'no_due_date':
      return 'No Due Date';
    case 'done':
      return 'Done';
    default:
      return 'Tasks';
  }
}

export function getTaskSectionDescription(section: TaskSectionKey): string {
  switch (section) {
    case 'in_progress':
      return 'Work that is underway right now.';
    case 'blocked':
      return 'Stalled on something else. Clear the blocker to get these moving.';
    case 'in_review':
      return 'Finished and waiting on a check before it can be called done.';
    case 'backlog':
      return 'Parked for now. Nothing here is scheduled.';
    case 'locked':
      return 'Waiting on an earlier activity to finish first.';
    case 'cancelled':
      return 'Dropped from this rollout. Kept for the record.';
    case 'overdue':
      return 'Hard deadlines that already slipped. Clear these first so the rollout does not drift.';
    case 'catch_up':
      return 'These tasks were already in the past when this rollout was created. It is a compressed timeline, not slippage. Start here.';
    case 'today':
      return 'What needs action before the day closes.';
    case 'week':
      return 'Tasks coming up next so your team can stay ahead of embargoes, deliveries, and approvals.';
    case 'upcoming':
      return 'Future work that is scheduled but not urgent yet.';
    case 'no_due_date':
      return 'Backlog work that still needs ownership and timing.';
    case 'done':
      return 'Completed tasks. Un-tick to return one to its active bucket.';
    default:
      return 'Tasks';
  }
}

export function getRelativeDueLabel(
  task: Pick<Task, 'dueDate' | 'completedAt' | 'compressedRunway'>,
  now = new Date()
): {
  label: string;
  isOverdue: boolean;
} {
  if (!task.dueDate) {
    return { label: 'No due date', isOverdue: false };
  }

  const dueDate = new Date(task.dueDate);
  if (Number.isNaN(dueDate.getTime())) {
    return { label: 'No due date', isOverdue: false };
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);

  const differenceInDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);

  if (differenceInDays === 0) {
    return { label: 'Due today', isOverdue: false };
  }

  if (differenceInDays === 1) {
    return { label: 'Due tomorrow', isOverdue: false };
  }

  if (differenceInDays > 1) {
    return { label: `Due in ${differenceInDays} days`, isOverdue: false };
  }

  const overdueDays = Math.abs(differenceInDays);

  // Compressed-runway tasks were never on a future-trajectory; the template
  // generated them already in the past. Surface them with neutral copy and
  // isOverdue=false so TaskRow doesn't paint them red. Completed catch-up
  // tasks fall through to the standard overdue framing so the row reads as
  // a finished-late item rather than mixed signals.
  if (task.compressedRunway && !task.completedAt) {
    return {
      label: overdueDays === 1 ? 'Behind by 1 day' : `Behind by ${overdueDays} days`,
      isOverdue: false,
    };
  }

  return {
    label: overdueDays === 1 ? '1 day overdue' : `${overdueDays} days overdue`,
    isOverdue: !task.completedAt,
  };
}

export function isEventMilestone(task: Pick<Task, 'taskType'>): boolean {
  return task.taskType === 'event_milestone';
}

/**
 * Date label for event milestones. A milestone isn't "due" — it happens on a
 * day — so this drops the deadline framing of getRelativeDueLabel and just
 * states the date (e.g., "On Jun 26").
 */
export function formatMilestoneDate(dueDate: string | null): string {
  if (!dueDate) return 'Date TBD';
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return 'Date TBD';
  return `On ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date)}`;
}

export function createEmptyMyTasksSections(): Record<TaskSectionKey, Task[]> {
  return {
    in_progress: [],
    blocked: [],
    in_review: [],
    overdue: [],
    catch_up: [],
    today: [],
    week: [],
    upcoming: [],
    no_due_date: [],
    backlog: [],
    locked: [],
    done: [],
    cancelled: [],
  };
}

export function groupTasksIntoSections(
  tasks: Task[],
  pendingCompletionIds?: ReadonlySet<string> | Record<string, TaskStatus | true>
): Record<TaskSectionKey, Task[]> {
  const grouped = createEmptyMyTasksSections();
  const now = new Date();

  for (const task of tasks) {
    grouped[getTaskSectionKey(task, now, pendingCompletionIds)].push(task);
  }

  return grouped;
}

export function formatNotificationTime(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return 'Just now';
  }

  const diffMs = Date.now() - timestamp.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return timestamp.toLocaleDateString();
}

export function getTaskSortValue(task: Task, sort: TaskSortKey): string | number {
  switch (sort) {
    case 'priority':
      return TASK_PRIORITY_OPTIONS.indexOf(task.priority);
    case 'assignee':
      return task.assignee?.name?.toLowerCase() || 'zzz';
    case 'status':
      return TASK_STATUS_OPTIONS.indexOf(task.status);
    case 'created_at':
      return task.createdAt;
    case 'due_date':
    default:
      return task.dueDate || '9999-12-31T23:59:59.999Z';
  }
}

export function sortTasks(tasks: Task[], sort: TaskSortKey): Task[] {
  return [...tasks].sort((left, right) => {
    const leftValue = getTaskSortValue(left, sort);
    const rightValue = getTaskSortValue(right, sort);

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return leftValue - rightValue;
    }

    return String(leftValue).localeCompare(String(rightValue));
  });
}

export function isReleaseOption(value: ReleaseOption | TaskReleaseSummary | null | undefined): value is
  | ReleaseOption
  | TaskReleaseSummary {
  return Boolean(value?.id);
}
