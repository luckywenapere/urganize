'use client';

import { CalendarClock, GripVertical, MessageSquare, Paperclip, UserRound } from 'lucide-react';
import {
  TASK_STATUS_OPTIONS,
  getPriorityDotClass,
  getRelativeDueLabel,
  getTaskStatusLabel,
  type Task,
  type TaskStatus,
  type WorkspaceMember,
} from '@/lib/tasks';
import type { KanbanTaskPatch } from '@/lib/release-kanban';
import { StatusBadge } from '@/components/shared/StatusBadge';

type KanbanTaskCardProps = {
  task: Task;
  members: WorkspaceMember[];
  isDragging?: boolean;
  onOpen: (task: Task) => void;
  onPatch: (taskId: string, patch: KanbanTaskPatch) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onDropOnTask: (targetTaskId: string) => void;
};

function toDateInputValue(value: string | null) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString().slice(0, 10);
}

export function KanbanTaskCard({
  task,
  members,
  isDragging = false,
  onOpen,
  onPatch,
  onDragStart,
  onDragEnd,
  onDropOnTask,
}: KanbanTaskCardProps) {
  const due = getRelativeDueLabel(task);
  const activeMembers = members.filter((member) => member.status === 'active');

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', task.id);
        onDragStart(task.id);
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDropOnTask(task.id);
      }}
      className={`group border border-stroke-default bg-bg-surface p-3 transition duration-150 hover:border-stroke-strong hover:bg-bg-hover ${
        isDragging ? 'scale-[0.98] opacity-55' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 grid h-6 w-5 shrink-0 cursor-grab place-items-center text-content-quaternary active:cursor-grabbing"
          aria-label={`Drag ${task.title}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-3 text-sm font-semibold leading-5 text-content-primary">{task.title}</h3>
            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`} />
          </div>
          {task.description ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-content-secondary">{task.description}</p>
          ) : null}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge label={getTaskStatusLabel(task.status)} tone={task.status === 'done' ? 'success' : 'neutral'} size="sm" />
        <span
          className={`inline-flex min-h-7 items-center gap-1.5 border border-stroke-default bg-bg-elevated px-2 text-xs ${
            due.isOverdue ? 'font-semibold text-status-error' : 'text-content-secondary'
          }`}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {due.label}
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        <label className="sr-only" htmlFor={`status-${task.id}`}>
          Task status
        </label>
        <select
          id={`status-${task.id}`}
          value={task.status}
          onChange={(event) => onPatch(task.id, { status: event.target.value as TaskStatus })}
          className="h-9 w-full border border-stroke-default bg-bg-elevated px-2 text-xs text-content-primary outline-none focus:border-brand"
        >
          {TASK_STATUS_OPTIONS.filter((status) => status !== 'locked').map((status) => (
            <option key={status} value={status}>
              {getTaskStatusLabel(status)}
            </option>
          ))}
        </select>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="relative block">
            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-content-tertiary">
              <UserRound className="h-3.5 w-3.5" />
            </span>
            <select
              value={task.assignedTo || ''}
              onChange={(event) => onPatch(task.id, { assignedTo: event.target.value || null })}
              className="h-9 w-full border border-stroke-default bg-bg-elevated pl-8 pr-2 text-xs text-content-primary outline-none focus:border-brand"
              aria-label="Assign task"
            >
              <option value="">Unassigned</option>
              {activeMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || member.email}
                </option>
              ))}
            </select>
          </label>

          <input
            type="date"
            value={toDateInputValue(task.dueDate)}
            onChange={(event) => onPatch(task.id, { dueDate: event.target.value || null })}
            className="h-9 w-full border border-stroke-default bg-bg-elevated px-2 text-xs text-content-primary outline-none focus:border-brand"
            aria-label="Task due date"
          />
        </div>
      </div>

      {task.commentCount || task.attachmentCount ? (
        <div className="mt-3 flex items-center gap-3 border-t border-stroke-subtle pt-3 text-xs text-content-tertiary">
          {task.commentCount ? (
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              {task.commentCount}
            </span>
          ) : null}
          {task.attachmentCount ? (
            <span className="inline-flex items-center gap-1.5">
              <Paperclip className="h-3.5 w-3.5" />
              {task.attachmentCount}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
