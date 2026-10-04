'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { leaveReleaseForCatalog } from '@/lib/catalog-intent';
import { getRelativeDueLabel, getPriorityDotClass } from '@/lib/tasks';
import type { HomeTaskItem, HomeYourTasks } from '@/lib/home/types';
import { HomeSectionShell } from './HomeSectionShell';
import { EmptyState } from '@/components/shared/EmptyState';

const VISIBLE = 5;

function TaskRow({ task }: { task: HomeTaskItem }) {
  const due = getRelativeDueLabel({ dueDate: task.dueDate, completedAt: null, compressedRunway: false });
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <TaskCompletionCheckbox taskId={task.id} status={task.status} taskTitle={task.title} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium text-content-primary sm:truncate">{task.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-content-tertiary">
          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`} aria-hidden="true" />
          <span className="break-words sm:truncate">
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
  const [expanded, setExpanded] = useState(false);
  const items = [...yourTasks.late, ...yourTasks.today, ...yourTasks.week];
  const shown = expanded ? items : items.slice(0, VISIBLE);
  const hidden = items.length - shown.length;

  return (
    <HomeSectionShell
      id="home-tasks"
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
        <>
          <ul className="divide-y divide-stroke-subtle">
            {shown.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
          {hidden > 0 || expanded ? (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className="motion-focus mt-2 min-h-11 w-full rounded-lg px-2 text-left text-xs font-semibold text-content-secondary hover:text-content-primary"
            >
              {expanded ? 'Show fewer' : `Show ${hidden} more`}
            </button>
          ) : null}
        </>
      )}
    </HomeSectionShell>
  );
}
