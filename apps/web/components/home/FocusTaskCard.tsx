'use client';

import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { getRelativeDueLabel } from '@/lib/tasks';
import type { FocusTask } from '@/lib/home/focus';

/**
 * The one task Home asks for, on top of the tasks stack: a title, where it sits,
 * a checkbox to finish it and a button to open it. It is the answer to "where do
 * I start" for a manager facing a long list. The stack (HomeStack) draws the
 * card around it, so this is only what goes inside.
 */
export function FocusTaskCard({ focus }: { focus: FocusTask }) {
  const { openTask } = useTaskUI();
  const { task } = focus;
  const due = getRelativeDueLabel({ dueDate: task.dueDate, completedAt: null, compressedRunway: false });
  const where = task.releaseTitle ? `${task.releaseTitle} · ${task.artistName || 'Unassigned artist'}` : 'No rollout';

  return (
    <div>
      <div className="flex items-start gap-3">
        <TaskCompletionCheckbox taskId={task.id} status={task.status} taskTitle={task.title} className="mt-1" />
        <div className="min-w-0 flex-1">
          <p className="break-words font-display text-xl font-semibold leading-snug text-content-primary">
            {task.title}
          </p>
          <p className="mt-1 break-words text-sm text-content-secondary">
            {where} ·{' '}
            <span className={due.isOverdue ? 'font-medium text-status-error' : ''}>{due.label}</span>
          </p>
        </div>
      </div>
      <div className="mt-4 flex">
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className="motion-focus motion-press inline-flex h-11 w-full items-center justify-center rounded-full bg-content-primary px-6 text-sm font-semibold text-content-inverse hover:opacity-90 sm:w-auto"
        >
          Open task
        </button>
      </div>
    </div>
  );
}
