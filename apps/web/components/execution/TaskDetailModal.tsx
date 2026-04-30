'use client';

import { X } from 'lucide-react';
import type { ExecutionTask } from '@/lib/execution-types';
import { TASK_DONE_STATUS } from '@/lib/execution-types';
import { getTaskCompletionBlocker } from '@/lib/release-execution';

export function TaskDetailModal({
  task,
  allTasks,
  onClose,
  onSatisfyRequirement,
  onComplete,
}: {
  task: ExecutionTask | null;
  allTasks: ExecutionTask[];
  onClose: () => void;
  onSatisfyRequirement: (task: ExecutionTask) => void;
  onComplete: (task: ExecutionTask) => void;
}) {
  if (!task) return null;

  const blocker = getTaskCompletionBlocker(task, allTasks);
  const chain = task.dependencies
    .map((id) => allTasks.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is ExecutionTask => Boolean(candidate));

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[150] flex items-end bg-black/70 p-0 sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[96vh] w-full overflow-y-auto rounded-t-[28px] border border-stroke-default bg-bg-surface p-5 shadow-2xl sm:max-w-2xl sm:rounded-[28px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="saas-eyebrow">Execution Block</p>
            <h2 className="mt-2 text-2xl text-content-primary">{task.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-stroke-default p-2 text-content-secondary hover:bg-bg-hover">
            <X className="h-4 w-4" />
          </button>
        </div>

        {task.description ? <p className="mt-4 text-sm leading-7 text-content-secondary">{task.description}</p> : null}

        <section className="mt-5 rounded-[18px] border border-stroke-subtle bg-bg-elevated p-4">
          <p className="text-sm font-semibold text-content-primary">Requirement</p>
          <p className="mt-1 text-sm text-content-secondary">
            {task.requirement ? task.requirement.spec : 'No requirement attached.'}
          </p>
          {task.requirement ? (
            <button
              type="button"
              onClick={() => onSatisfyRequirement(task)}
              disabled={task.requirement.satisfied}
              className="mt-3 rounded-full border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-55"
            >
              {task.requirement.satisfied ? 'Requirement Satisfied' : 'Mock Upload / Satisfy'}
            </button>
          ) : null}
        </section>

        <section className="mt-5 rounded-[18px] border border-stroke-subtle bg-bg-elevated p-4">
          <p className="text-sm font-semibold text-content-primary">Dependency Graph</p>
          {chain.length ? (
            <div className="mt-3 space-y-2">
              {chain.map((dependency, index) => (
                <div key={dependency.id} className="flex items-center gap-2 text-sm text-content-secondary">
                  <span className="rounded-full border border-stroke-subtle px-2 py-1">{dependency.status === TASK_DONE_STATUS ? 'Done' : 'Waiting'}</span>
                  <span>{dependency.title}</span>
                  {index < chain.length - 1 ? <span>↓</span> : null}
                </div>
              ))}
              <div className="text-sm font-semibold text-content-primary">↓ {task.title}</div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-content-secondary">No dependencies. This task can move as soon as its requirement is satisfied.</p>
          )}
        </section>

        {blocker ? <p className="mt-4 text-sm text-status-error">{blocker}</p> : null}

        <button
          type="button"
          onClick={() => onComplete(task)}
          disabled={Boolean(blocker) || task.status === TASK_DONE_STATUS}
          className="mt-5 min-h-11 w-full rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-55"
        >
          {task.status === TASK_DONE_STATUS ? 'Completed' : 'Mark as Complete'}
        </button>
      </div>
    </div>
  );
}
