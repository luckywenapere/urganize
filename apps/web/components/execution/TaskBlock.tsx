'use client';

import { Check, Lock, Paperclip } from 'lucide-react';
import type { ExecutionTask } from '@/lib/execution-types';
import { TASK_DONE_STATUS } from '@/lib/execution-types';
import { getTaskCompletionBlocker } from '@/lib/release-execution';

export function TaskBlock({
  task,
  allTasks,
  onOpen,
  onComplete,
}: {
  task: ExecutionTask;
  allTasks: ExecutionTask[];
  onOpen: (task: ExecutionTask) => void;
  onComplete: (task: ExecutionTask) => void;
}) {
  const blocker = getTaskCompletionBlocker(task, allTasks);
  const done = task.status === TASK_DONE_STATUS;

  return (
    <div className="rounded-[18px] border border-stroke-subtle bg-bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
          <p className="font-semibold text-content-primary">{task.title}</p>
          {task.description ? <p className="mt-1 line-clamp-2 text-sm text-content-secondary">{task.description}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-content-tertiary">
            <span className="rounded-full border border-stroke-subtle px-2 py-1">{task.state.replace(/_/g, ' ')}</span>
            {task.dueDate ? <span>Due {new Date(task.dueDate).toLocaleDateString()}</span> : null}
            {task.requirement ? (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" />
                {task.requirement.satisfied ? 'Requirement met' : task.requirement.type.replace(/_/g, ' ')}
              </span>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          disabled={done || Boolean(blocker)}
          onClick={() => onComplete(task)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-45"
          title={blocker || (done ? 'Completed' : 'Mark complete')}
        >
          {blocker ? <Lock className="h-4 w-4" /> : <Check className="h-4 w-4" />}
        </button>
      </div>
      {blocker ? <p className="mt-3 text-xs text-status-error">{blocker}</p> : null}
    </div>
  );
}
