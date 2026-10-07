'use client';

import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { getPriorityDotClass, getRelativeDueLabel } from '@/lib/tasks';
import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import type { TaskStack } from '@/lib/home/stack-items';
import type { HomeTaskItem } from '@/lib/home/types';
import { FocusTaskCard } from './FocusTaskCard';
import { HomeStack } from './HomeStack';

type TaskEntry = { kind: 'focus'; stack: TaskStack } | { kind: 'task'; task: HomeTaskItem };

function TaskRow({ task }: { task: HomeTaskItem }) {
  const { openTask } = useTaskUI();
  const due = getRelativeDueLabel({ dueDate: task.dueDate, completedAt: null, compressedRunway: false });
  return (
    <div className="flex items-start gap-3">
      <TaskCompletionCheckbox taskId={task.id} status={task.status} taskTitle={task.title} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className="motion-focus block w-full break-words text-left text-sm font-medium text-content-primary hover:text-brand"
        >
          {task.title}
        </button>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-content-tertiary">
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`} aria-hidden="true" />
          <span className="break-words">
            {task.releaseTitle ? `${task.releaseTitle} · ${task.artistName || 'Unassigned artist'}` : 'No rollout'}
          </span>
          <span aria-hidden="true">·</span>
          <span className={due.isOverdue ? 'font-medium text-status-error' : ''}>{due.label}</span>
        </p>
      </div>
    </div>
  );
}

/**
 * Your tasks as one stack (2026-10-07): the task to do first is the card on top,
 * with its Open task button, and the rest of your late, today and this-week
 * tasks fold in behind it.
 */
export function TasksStack({ stack }: { stack: TaskStack }) {
  const entries: TaskEntry[] = [
    { kind: 'focus', stack },
    ...stack.rest.map((task): TaskEntry => ({ kind: 'task', task })),
  ];
  return (
    <HomeStack
      label={HOME_BLOCK_LABELS.tasks}
      items={entries}
      getKey={(entry) => (entry.kind === 'focus' ? `focus-${entry.stack.top.task.id}` : entry.task.id)}
      renderItem={(entry) =>
        entry.kind === 'focus' ? <FocusTaskCard focus={entry.stack.top} /> : <TaskRow task={entry.task} />
      }
    />
  );
}
