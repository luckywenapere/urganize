'use client';

import { useState } from 'react';
import { getPriorityDotClass } from '@/lib/tasks';
import type { HomeWaitingDjLink, HomeWaitingTask } from '@/lib/home/types';
import { HomeSectionShell } from './HomeSectionShell';
import { EmptyState } from '@/components/shared/EmptyState';

const VISIBLE = 3;

function WaitingTaskRow({ task }: { task: HomeWaitingTask }) {
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span
        className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium sm:truncate text-content-primary">{task.title}</p>
        <p className="mt-0.5 break-words text-xs sm:truncate text-content-tertiary">
          {task.assigneeName || 'Someone on your team'}
          {task.releaseTitle ? ` · ${task.releaseTitle}` : ''}
          {' · '}
          <span className="font-medium text-status-error">
            {task.daysLate === 1 ? '1 day overdue' : `${task.daysLate} days overdue`}
          </span>
        </p>
      </div>
    </li>
  );
}

function DjLinkRow({ link }: { link: HomeWaitingDjLink }) {
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium sm:truncate text-content-primary">{link.recipientName}</p>
        <p className="mt-0.5 break-words text-xs sm:truncate text-content-tertiary">
          {link.showLabel} · DJ link not opened, {Math.floor(link.hoursWaiting / 24)}d
        </p>
      </div>
    </li>
  );
}

/**
 * Step 2 scope: read-only. Nudge (mapping report item, waits on migration
 * #2 — a task_nudged notification type) is deliberately not built until
 * step 7, so no action button appears here yet.
 */
export function WaitingOnOthersSection({
  tasks,
  djLinks,
  onTimeCount,
}: {
  tasks: readonly HomeWaitingTask[];
  djLinks: readonly HomeWaitingDjLink[];
  onTimeCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasWaiting = tasks.length > 0 || djLinks.length > 0;
  const total = tasks.length + djLinks.length;
  const limit = expanded ? total : VISIBLE;
  const shownTasks = tasks.slice(0, limit);
  const shownLinks = djLinks.slice(0, Math.max(0, limit - shownTasks.length));
  const hidden = total - shownTasks.length - shownLinks.length;

  return (
    <HomeSectionShell id="home-waiting" title="Waiting on others">
      {!hasWaiting ? (
        <EmptyState
          title={
            onTimeCount > 0
              ? `${onTimeCount} ${onTimeCount === 1 ? 'task is' : 'tasks are'} with your team and on time.`
              : 'Nothing is waiting on anyone right now.'
          }
          className="py-4"
        />
      ) : (
        <>
          <ul className="divide-y divide-stroke-subtle">
            {shownTasks.map((task) => (
              <WaitingTaskRow key={task.id} task={task} />
            ))}
            {shownLinks.map((link) => (
              <DjLinkRow key={`${link.showId}-${link.recipientId}`} link={link} />
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
          {onTimeCount > 0 ? (
            <p className="mt-3 border-t border-stroke-subtle pt-3 text-xs text-content-tertiary">
              {onTimeCount} more {onTimeCount === 1 ? 'task is' : 'tasks are'} with your team and on time.
            </p>
          ) : null}
        </>
      )}
    </HomeSectionShell>
  );
}
