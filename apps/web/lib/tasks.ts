import type { PreSaveReleaseOption } from '@/lib/pre-save';

/**
 * Audit findings before building collaborative tasks:
 * 1. Releases are the app's center of gravity. `/dashboard/releases/[releaseId]` is the active release workspace, with
 *    Tracks, Playbook, Metadata, Pre-Save, credits, and retention hooks all hanging off a release id.
 * 2. Team structure already exists in two places: owner-led `organizations` + `organization_members` for workspace-ish
 *    settings, and release-specific `release_collaborators` for credits collection. Neither currently powers assignment.
 * 3. There is no in-app notification center yet. The only notification surface today is local preference toggles in
 *    `/settings`, so task notifications need to introduce the first real notification feed.
 * 4. `@urganize/ui` only exposes low-level primitives (Button/Input/Card/Logo/etc.). More advanced patterns such as the
 *    release selector combobox live in app code and can be reused directly.
 * 5. The repo already has legacy `ai_tasks` and old `types/index.ts` task types tied to onboarding/release-plan output.
 *    Those are distinct from the collaborative team task system built here and should not be treated as the same model.
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
  TaskGroup
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
  TaskNotification 
};

export const NOTIFICATION_TYPE_OPTIONS = [
  'task_assigned',
  'task_commented',
  'task_due_soon',
  'task_overdue',
  'task_status_changed',
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
      return `${notification.actorName} assigned you a task`;
    case 'task_commented':
      return `${notification.actorName} commented on a task`;
    case 'task_due_soon':
      return 'A task is due soon';
    case 'task_overdue':
      return 'A task is overdue';
    case 'task_status_changed':
      return `${notification.actorName} changed a task status`;
    default:
      return 'Task update';
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
      return 'border-l-[#E3C240]';
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
      return 'bg-[#E3C240]';
    case 'low':
      return 'bg-status-info';
    default:
      return 'bg-white/10';
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

export function getTaskSectionKey(task: Task, now = new Date()): TaskSectionKey {
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
    case 'overdue':
      return 'Overdue';
    case 'today':
      return 'Due Today';
    case 'week':
      return 'Due This Week';
    case 'upcoming':
      return 'Upcoming';
    case 'no_due_date':
      return 'No Due Date';
    default:
      return 'Tasks';
  }
}

export function getTaskSectionDescription(section: TaskSectionKey): string {
  switch (section) {
    case 'overdue':
      return 'Hard deadlines that already slipped. Clear these first so the release does not drift.';
    case 'today':
      return 'What needs action before the day closes.';
    case 'week':
      return 'Tasks coming up next so your team can stay ahead of embargoes, deliveries, and approvals.';
    case 'upcoming':
      return 'Future work that is scheduled but not urgent yet.';
    case 'no_due_date':
      return 'Backlog work that still needs ownership and timing.';
    default:
      return 'Tasks';
  }
}

export function getRelativeDueLabel(task: Pick<Task, 'dueDate' | 'completedAt'>, now = new Date()): {
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
  return {
    label: overdueDays === 1 ? '1 day overdue' : `${overdueDays} days overdue`,
    isOverdue: !task.completedAt,
  };
}

export function createEmptyMyTasksSections(): Record<TaskSectionKey, Task[]> {
  return {
    overdue: [],
    today: [],
    week: [],
    upcoming: [],
    no_due_date: [],
  };
}

export function groupTasksIntoSections(tasks: Task[]): Record<TaskSectionKey, Task[]> {
  const grouped = createEmptyMyTasksSections();

  for (const task of tasks) {
    grouped[getTaskSectionKey(task)].push(task);
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

export function isReleaseOption(value: PreSaveReleaseOption | TaskReleaseSummary | null | undefined): value is
  | PreSaveReleaseOption
  | TaskReleaseSummary {
  return Boolean(value?.id);
}
