'use client';

import { CalendarClock, GripVertical, MessageSquare, Paperclip, UserRound } from 'lucide-react';
import {
  getRelativeDueLabel,
  getPriorityDotClass,
  getTaskStatusLabel,
  getTaskStatusTone,
  type Task,
} from '@/lib/tasks';
import { StatusBadge } from '@/components/shared/StatusBadge';

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
  const assigneeLabel = task.assignee?.name || task.assignee?.email || 'Unassigned';

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
      className="panel-shell-subtle w-full rounded-xl p-4 text-left transition hover:border-brand/35 hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"
      data-ph-capture-attribute-section="tasks"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-2">
          {draggable ? (
            <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-content-quaternary" aria-hidden="true" />
          ) : null}
          <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-content-primary">{task.title}</p>
        </div>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`} />
      </div>

      <div className="mt-3">
        <StatusBadge label={getTaskStatusLabel(task.status)} tone={getTaskStatusTone(task.status)} size="sm" />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-content-secondary">
        <span
          className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-2.5 py-1 ${
            task.assignee
              ? 'border-stroke-default bg-bg-elevated text-content-secondary'
              : 'border-dashed border-stroke-default text-content-tertiary'
          }`}
        >
          <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{assigneeLabel}</span>
        </span>

        <span
          className={`inline-flex min-h-7 items-center gap-2 rounded-full border border-stroke-default bg-bg-base/40 px-2.5 py-1 ${
            due.isOverdue ? 'font-semibold text-status-error' : ''
          }`}
        >
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {due.label}
        </span>
      </div>

      {task.commentCount || task.attachmentCount ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stroke-subtle pt-3 text-xs text-content-tertiary">
          {task.commentCount ? (
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {task.commentCount}
            </span>
          ) : null}
          {task.attachmentCount ? (
            <span className="inline-flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
              {task.attachmentCount}
            </span>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
