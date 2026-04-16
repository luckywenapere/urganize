'use client';

import { getRelativeDueLabel, getPriorityDotClass, type Task } from '@/lib/tasks';

type TaskCardProps = {
  task: Task;
  onClick?: (task: Task) => void;
  draggable?: boolean;
  onDragStart?: (task: Task) => void;
  onDragOver?: (task: Task, event: React.DragEvent<HTMLButtonElement>) => void;
  onDrop?: (task: Task) => void;
};

export function TaskCard({ task, onClick, draggable = false, onDragStart, onDragOver, onDrop }: TaskCardProps) {
  const due = getRelativeDueLabel(task);

  return (
    <button
      type="button"
      draggable={draggable}
      onClick={() => onClick?.(task)}
      onDragStart={() => onDragStart?.(task)}
      onDragOver={(event) => {
        if (!onDragOver) {
          return;
        }

        event.preventDefault();
        onDragOver(task, event);
      }}
      onDrop={(event) => {
        if (!onDrop) {
          return;
        }

        event.preventDefault();
        onDrop(task);
      }}
      className="panel-shell-subtle w-full p-4 text-left transition hover:border-brand/35 hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"
      data-ph-capture-attribute-section="tasks"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-semibold text-content-primary">{task.title}</p>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-content-secondary">
        {task.assignee ? (
          <span className="rounded-full border border-stroke-default bg-bg-elevated px-2 py-1">
            {task.assignee.name}
          </span>
        ) : (
          <span className="rounded-full border border-dashed border-stroke-default px-2 py-1 text-content-tertiary">
            Unassigned
          </span>
        )}

        <span className={due.isOverdue ? 'font-semibold text-status-error' : ''}>{due.label}</span>
      </div>
    </button>
  );
}
