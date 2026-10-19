'use client';

import { Check, Link2 } from '@/components/icons';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { getTaskStatusLabel, getTaskStatusTone, type TaskStatus } from '@/lib/tasks';
import { TASK_DONE_STATUS, isDependencySatisfied } from '@/lib/execution-types';
import { dependencyHint } from '@/lib/release-execution';

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
  /** This task's own status: a closed (done/cancelled) task gets no
   *  "finish each prerequisite" hint, it has nothing left to finish (URG-389). */
  taskStatus?: string;
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
  taskStatus,
}: TaskDependenciesSectionProps) {
  if (dependencyIds.length === 0) {
    return null;
  }

  // Preserve the order the dependencies were declared in.
  const byId = new Map(prerequisites.map((task) => [task.id, task]));
  // One line that says where this stands (URG-389): what still has to be
  // finished, or that a cancelled prerequisite no longer holds it up.
  const hint =
    taskStatus && isDependencySatisfied(taskStatus)
      ? ''
      : dependencyHint(dependencyIds.map((id) => byId.get(id)?.status ?? null));

  return (
    // De-boxed 2026-09-05: the activity pop-up went boxless, and a bordered
    // card here was the one thing left drawing a rectangle. The icon column
    // (h-4 + gap-3) lines this heading up with the rows above it.
    <section>
      <div className="flex items-center gap-3">
        <Link2 className="h-4 w-4 shrink-0 text-content-tertiary" aria-hidden="true" />
        <h3 className="text-sm text-content-primary">Depends on</h3>
      </div>
      {hint ? <p className="ml-7 mt-0.5 text-xs text-content-secondary">{hint}</p> : null}

      <ul className="ml-7 mt-2 space-y-2">
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

          // Done or cancelled: it holds nothing up any more (URG-389), so
          // both read quiet. The badge still says which one it was.
          const isDone = isDependencySatisfied(task.status);
          const isTicked = task.status === TASK_DONE_STATUS;
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
                    isTicked
                      ? 'border-brand/40 bg-brand/15 text-brand'
                      : isDone
                        ? // Cancelled: a quiet hollow ring, never the done green (URG-389).
                          'border-stroke-subtle bg-transparent text-content-tertiary'
                        : 'border-stroke-default bg-bg-elevated text-content-tertiary'
                  }`}
                  aria-hidden
                >
                  {isTicked ? <Check className="h-3 w-3" /> : null}
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
