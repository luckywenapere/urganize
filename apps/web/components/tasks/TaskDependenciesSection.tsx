'use client';

import { Check, Link2 } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { getTaskStatusLabel, getTaskStatusTone, type TaskStatus } from '@/lib/tasks';
import { TASK_DONE_STATUS } from '@/lib/execution-types';

export type DependencyTaskSummary = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
};

type TaskDependenciesSectionProps = {
  /** Ordered list of prerequisite-task IDs from the current task. */
  dependencyIds: string[];
  /** Resolved prerequisite tasks (only those we have data for). */
  prerequisites: DependencyTaskSummary[];
  onOpenPrerequisite: (taskId: string) => void;
};

function formatDueLabel(value: string | null): string {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(parsed);
}

export function TaskDependenciesSection({
  dependencyIds,
  prerequisites,
  onOpenPrerequisite,
}: TaskDependenciesSectionProps) {
  if (dependencyIds.length === 0) {
    return null;
  }

  // Preserve the order the dependencies were declared in.
  const byId = new Map(prerequisites.map((task) => [task.id, task]));

  return (
    <section className="rounded-[24px] border border-stroke-default bg-bg-elevated/50 p-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-3.5 w-3.5 text-content-tertiary" />
        <h3 className="text-sm font-semibold text-content-primary">Depends on</h3>
      </div>
      <p className="mt-1 text-xs text-content-secondary">
        Finish each prerequisite before this task can be marked done.
      </p>

      <ul className="mt-3 space-y-2">
        {dependencyIds.map((id) => {
          const task = byId.get(id);

          if (!task) {
            return (
              <li
                key={id}
                className="flex items-center justify-between gap-3 rounded-[18px] border border-stroke-subtle bg-bg-surface px-3 py-2.5 text-sm text-content-tertiary"
              >
                <span>Prerequisite not available</span>
              </li>
            );
          }

          const isDone = task.status === TASK_DONE_STATUS;
          const dueLabel = formatDueLabel(task.dueDate);

          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpenPrerequisite(task.id)}
                className={`flex w-full items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition ${
                  isDone
                    ? 'border-stroke-subtle bg-bg-surface/60 hover:bg-bg-hover'
                    : 'border-stroke-default bg-bg-surface hover:bg-bg-hover'
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                    isDone
                      ? 'border-brand/40 bg-brand/15 text-brand'
                      : 'border-stroke-default bg-bg-elevated text-content-tertiary'
                  }`}
                  aria-hidden
                >
                  {isDone ? <Check className="h-3 w-3" /> : null}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-sm font-medium ${
                    isDone ? 'text-content-tertiary line-through' : 'text-content-primary'
                  }`}
                >
                  {task.title}
                </span>
                {dueLabel ? (
                  <span className="shrink-0 text-xs text-content-tertiary">{dueLabel}</span>
                ) : null}
                <StatusBadge
                  label={getTaskStatusLabel(task.status)}
                  tone={getTaskStatusTone(task.status)}
                  size="sm"
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
