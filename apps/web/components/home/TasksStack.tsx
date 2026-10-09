'use client';

import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { getPriorityDotClass } from '@/lib/tasks';
import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import type { TaskStack } from '@/lib/home/stack-items';
import { describeTaskLine } from '@/lib/home/task-line';
import type { HomeTaskItem } from '@/lib/home/types';
import { FocusTaskCard } from './FocusTaskCard';
import { HomeStack } from './HomeStack';

type TaskEntry = { kind: 'focus'; stack: TaskStack } | { kind: 'task'; task: HomeTaskItem };

function TaskRow({ task }: { task: HomeTaskItem }) {
  const { openTask } = useTaskUI();
  const line = describeTaskLine(task);
  return (
    <div className="flex items-start gap-3">
      {/* Above the card-wide button below, so ticking a task never opens it. */}
      <TaskCompletionCheckbox taskId={task.id} status={task.status} taskTitle={task.title} className="relative z-10 mt-0.5" />
      <div className="min-w-0 flex-1">
        {/* One statement: the task, its rollout and artist, and when it is due,
            in a single paragraph. The task name's ::after stretches over the
            whole card, so a click anywhere on it opens the task. */}
        <p className="flex items-start gap-1.5 break-words text-sm leading-snug">
          <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`} aria-hidden="true" />
          {/* The whole sentence is inside the button so it wraps as one line of
              text; with only the name inside, the rest dropped to its own line. */}
          <button
            type="button"
            onClick={() => openTask(task.id)}
            className="motion-focus group min-w-0 cursor-pointer text-left after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-brand/60"
          >
            <span className="font-medium text-content-primary group-hover:text-brand">{line.title}</span>
            <span className={line.isOverdue ? 'text-status-error' : 'text-content-secondary'}>
              {line.joiner}
              {line.rest}
            </span>
          </button>
        </p>
      </div>
    </div>
  );
}

/**
 * Your tasks as one stack (2026-10-07): the task to do first is the card on top
 * and the rest of your late, today and this-week tasks fold in behind it. Every
 * card opens its task wherever you click it, except the tick circle, which only
 * finishes the task (2026-10-08, founder call: no separate Open task button).
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
      cardTone={() => 'border-stroke-default hover:border-stroke-strong'}
      renderItem={(entry) =>
        entry.kind === 'focus' ? <FocusTaskCard focus={entry.stack.top} /> : <TaskRow task={entry.task} />
      }
    />
  );
}
