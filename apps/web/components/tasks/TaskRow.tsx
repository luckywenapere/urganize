'use client';

import { getRelativeDueLabel, getTaskStatusLabel, getTaskStatusTone, getPriorityBorderClass, type Task } from '@/lib/tasks';
import { StatusBadge } from '@/components/shared/StatusBadge';

type TaskRowProps = {
  task: Task;
  onClick?: (task: Task) => void;
  showCheckbox?: boolean;
  selected?: boolean;
  onSelectedChange?: (checked: boolean) => void;
};

function getAssigneeLabel(task: Task): string {
  if (task.assignee?.name) {
    return task.assignee.name;
  }

  return task.assignee?.email || 'Unassigned';
}

export function TaskRow({ task, onClick, showCheckbox = false, selected = false, onSelectedChange }: TaskRowProps) {
  const due = getRelativeDueLabel(task);

  return (
    <div
      className={`group flex min-h-[76px] items-center gap-4 border-l-4 border-t border-stroke-subtle bg-bg-surface px-4 py-3.5 transition first:border-t-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 focus-visible:ring-offset-0 ${getPriorityBorderClass(
        task.priority
      )} ${onClick ? 'cursor-pointer hover:bg-bg-hover' : ''}`}
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
      {showCheckbox ? (
        <label
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectedChange?.(event.target.checked)}
            className="h-4.5 w-4.5 rounded border-stroke-default bg-transparent text-brand"
          />
        </label>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-content-primary">{task.title}</p>
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
