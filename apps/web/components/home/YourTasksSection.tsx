'use client';

import Link from 'next/link';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { getRelativeDueLabel, getPriorityDotClass } from '@/lib/tasks';
import type { HomeTaskItem, HomeYourTasks } from '@/lib/home/types';
import { HomeSectionShell } from './HomeSectionShell';
import { EmptyState } from '@/components/shared/EmptyState';

function TaskRow({ task }: { task: HomeTaskItem }) {
  const due = getRelativeDueLabel({ dueDate: task.dueDate, completedAt: null, compressedRunway: false });
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <TaskCompletionCheckbox taskId={task.id} status={task.status} taskTitle={task.title} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-content-primary">{task.title}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-content-tertiary">
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`} aria-hidden="true" />
          <span className="truncate">
            {task.releaseTitle ? `${task.releaseTitle} · ${task.artistName || 'Unassigned artist'}` : 'No rollout'}
          </span>
          <span aria-hidden="true">·</span>
          <span className={due.isOverdue ? 'font-medium text-status-error' : ''}>{due.label}</span>
        </p>
      </div>
    </li>
  );
}

export function YourTasksSection({ yourTasks }: { yourTasks: HomeYourTasks }) {
  const items = [...yourTasks.late, ...yourTasks.today, ...yourTasks.week];

  return (
    <HomeSectionShell
      title="Your tasks"
      action={
        <Link
          href="/dashboard"
          onClick={leaveReleaseForCatalog}
          className="motion-focus text-xs font-medium text-content-tertiary hover:text-content-primary"
        >
          See all
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="Nothing needs you right now." className="py-4" />
      ) : (
        <ul className="divide-y divide-stroke-subtle">
          {items.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
    </HomeSectionShell>
  );
}
