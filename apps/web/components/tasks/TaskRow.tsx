'use client';

import { CalendarDays, Lock } from 'lucide-react';
import {
  formatMilestoneDate,
  getPriorityBorderClass,
  getPriorityDotClass,
  getRelativeDueLabel,
  getTaskStatusLabel,
  getTaskStatusTone,
  isEventMilestone,
  type Task,
} from '@/lib/tasks';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';

type TaskRowProps = {
  task: Task;
  onClick?: (task: Task) => void;
  /** Receives the blocker text when the user clicks the completion checkbox
   * on a task that can't be marked done yet. Parent should surface via toast. */
  onBlocker?: (message: string) => void;
  /** Layout density. `comfortable` (default) is the wide release-detail layout:
   * single row, status badge on the right, release pill inline with the title,
   * assignee in the meta line. `compact` is the narrow workspace-panel layout:
   * two stacked lines (title, then meta), no status badge / no assignee /
   * no release pill — the surrounding workspace already shows scope context,
   * and priority is still conveyed by the left border. */
  density?: 'compact' | 'comfortable';
};

function getAssigneeLabel(task: Task): string {
  if (task.assignee?.name) {
    return task.assignee.name;
  }

  return task.assignee?.email || 'Unassigned';
}

export function TaskRow({ task, onClick, onBlocker, density = 'comfortable' }: TaskRowProps) {
  const due = getRelativeDueLabel(task);
  const isLocked = task.status === 'locked';
  const isMilestone = isEventMilestone(task);
  // Left-border accent precedence: locked (muted gray, "not ready") wins, then
  // event milestones (info blue, "dated point"), then the priority color.
  const borderClass = isLocked
    ? 'border-l-stroke-default'
    : isMilestone
      ? 'border-l-status-info'
      : getPriorityBorderClass(task.priority);

  const isCompact = density === 'compact';
  const titleClass = `truncate text-sm font-semibold ${
    isLocked ? 'text-content-secondary' : 'text-content-primary'
  } ${task.status === 'done' ? 'line-through' : ''}`;

  const interactionHandlers = {
    onClick: () => onClick?.(task),
    role: onClick ? ('button' as const) : undefined,
    tabIndex: onClick ? 0 : undefined,
    onKeyDown: (event: React.KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && onClick) {
        event.preventDefault();
        onClick(task);
      }
    },
  };

  if (isCompact) {
    return (
      <div
        className={`group flex items-center gap-3 border-l-4 border-t border-stroke-subtle bg-bg-surface px-4 py-3 transition first:border-t-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-0 ${borderClass} ${
          onClick ? 'cursor-pointer hover:bg-bg-hover' : ''
        } ${isLocked ? 'bg-bg-surface/60' : ''}`}
        {...interactionHandlers}
        data-ph-capture-attribute-section="tasks"
      >
        <TaskCompletionCheckbox
          taskId={task.id}
          status={task.status}
          onBlocker={onBlocker}
          taskTitle={task.title}
        />
        <div className="min-w-0 flex-1">
          <p className={titleClass} title={task.title}>
            {task.title}
          </p>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-content-secondary">
            <span
              className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`}
              aria-hidden="true"
            />
            {isMilestone ? (
              <span className="inline-flex items-center gap-1 text-status-info">
                <CalendarDays className="h-3 w-3" aria-label="Event milestone" />
                {formatMilestoneDate(task.dueDate)}
              </span>
            ) : (
              <span className={due.isOverdue ? 'font-semibold text-status-error' : ''}>
                {due.label}
              </span>
            )}
            {isLocked ? (
              <Lock
                className="h-3 w-3 text-content-tertiary"
                aria-label="Locked — waiting on a prerequisite"
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // Comfortable (default) — release-detail page layout.
  return (
    <div
      className={`group flex min-h-[76px] items-center gap-4 border-l-4 border-t border-stroke-subtle bg-bg-surface px-4 py-3.5 transition first:border-t-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-0 ${borderClass} ${
        onClick ? 'cursor-pointer hover:bg-bg-hover' : ''
      } ${isLocked ? 'bg-bg-surface/60' : ''}`}
      {...interactionHandlers}
      data-ph-capture-attribute-section="tasks"
    >
      <TaskCompletionCheckbox
        taskId={task.id}
        status={task.status}
        onBlocker={onBlocker}
        taskTitle={task.title}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Lock
              className="h-3.5 w-3.5 shrink-0 text-content-tertiary"
              aria-label="Locked — waiting on a prerequisite"
            />
          ) : isMilestone ? (
            <CalendarDays
              className="h-3.5 w-3.5 shrink-0 text-status-info"
              aria-label="Event milestone"
            />
          ) : null}
          <p className={titleClass} title={task.title}>
            {task.title}
          </p>
          {task.release ? (
            <span className="hidden rounded-full border border-stroke-default bg-bg-elevated px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-content-secondary sm:inline-flex">
              {task.release.title}
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
          <span>{getAssigneeLabel(task)}</span>
          <span className="text-content-tertiary">•</span>
          {isMilestone ? (
            <span className="text-status-info">{formatMilestoneDate(task.dueDate)}</span>
          ) : (
            <span className={due.isOverdue ? 'font-semibold text-status-error' : ''}>{due.label}</span>
          )}
        </div>
      </div>

      <StatusBadge label={getTaskStatusLabel(task.status)} tone={getTaskStatusTone(task.status)} size="sm" />
    </div>
  );
}
