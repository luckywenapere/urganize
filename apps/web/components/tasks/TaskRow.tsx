'use client';

import { Lock } from 'lucide-react';
import { getRelativeDueLabel, getTaskStatusLabel, getTaskStatusTone, getPriorityBorderClass, type Task } from '@/lib/tasks';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';

type TaskRowProps = {
  task: Task;
  onClick?: (task: Task) => void;
  /** Receives the blocker text when the user clicks the completion checkbox
   * on a task that can't be marked done yet. Parent should surface via toast. */
  onBlocker?: (message: string) => void;
};

function getAssigneeLabel(task: Task): string {
  if (task.assignee?.name) {
    return task.assignee.name;
  }

  return task.assignee?.email || 'Unassigned';
}

export function TaskRow({ task, onClick, onBlocker }: TaskRowProps) {
  const due = getRelativeDueLabel(task);
  const isLocked = task.status === 'locked';
  // Locked tasks override the priority accent — the left border becomes a
  // muted gray that reads as "not ready" rather than its priority color.
  const borderClass = isLocked ? 'border-l-stroke-default' : getPriorityBorderClass(task.priority);

  return (
    <div
      className={`group flex min-h-[76px] items-center gap-4 border-l-4 border-t border-stroke-subtle bg-bg-surface px-4 py-3.5 transition first:border-t-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-0 ${borderClass} ${
        onClick ? 'cursor-pointer hover:bg-bg-hover' : ''
      } ${isLocked ? 'bg-bg-surface/60' : ''}`}
      onClick={() => onClick?.(task)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && onClick) {
          event.preventDefault();
          onClick(task);
        }
      }}
      data-ph-capture-attribute-section="tasks"
    >
      <TaskCompletionCheckbox taskId={task.id} status={task.status} onBlocker={onBlocker} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Lock
              className="h-3.5 w-3.5 shrink-0 text-content-tertiary"
              aria-label="Locked — waiting on a prerequisite"
            />
          ) : null}
          <p
            className={`truncate text-sm font-semibold ${
              isLocked ? 'text-content-secondary' : 'text-content-primary'
            } ${task.status === 'done' ? 'line-through' : ''}`}
          >
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
          <span className={due.isOverdue ? 'font-semibold text-status-error' : ''}>{due.label}</span>
        </div>
      </div>

      <StatusBadge label={getTaskStatusLabel(task.status)} tone={getTaskStatusTone(task.status)} size="sm" />
    </div>
  );
}
