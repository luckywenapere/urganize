'use client';

import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import type { FocusTask } from '@/lib/home/focus';
import { describeTaskLine } from '@/lib/home/task-line';

/**
 * The one task Home asks for, on top of the tasks stack: a title, where it sits
 * and a checkbox to finish it. The whole card opens the task (there is no
 * separate Open task button). It is the answer to "where do I start" for a
 * manager facing a long list. The stack (HomeStack) draws the card around it,
 * so this is only what goes inside.
 */
export function FocusTaskCard({ focus }: { focus: FocusTask }) {
  const { openTask } = useTaskUI();
  const { task } = focus;
  const line = describeTaskLine(task);

  return (
    <div className="flex items-start gap-3">
      {/* Above the card-wide button below, so ticking a task never opens it. */}
      <TaskCompletionCheckbox taskId={task.id} status={task.status} taskTitle={task.title} className="relative z-10 mt-1" />
      <div className="min-w-0 flex-1">
        {/* One statement: the task, its rollout and artist, and when it is due,
            in a single paragraph. The task name is the real button, and its
            ::after stretches over the whole card (the card is the positioned
            parent), so a click anywhere on the card opens the task and keyboard
            users still get one control. */}
        {/* The whole sentence sits INSIDE the button. A button is an inline-block,
            so with only the name inside it the rest of the sentence could not
            start until the name's box ended and dropped to its own line. */}
        <button
          type="button"
          onClick={() => openTask(task.id)}
          className="motion-focus group block w-full cursor-pointer break-words text-left font-display text-lg leading-snug after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-brand/60"
        >
          <span className="font-semibold text-content-primary group-hover:text-brand">{line.title}</span>
          <span className={line.isOverdue ? 'text-status-error' : 'text-content-secondary'}>
            {line.joiner}
            {line.rest}
          </span>
        </button>
      </div>
    </div>
  );
}
