import { getPriorityDotClass } from '@/lib/tasks';
import type { HomeWaitingDjLink, HomeWaitingTask } from '@/lib/home/types';
import { HomeSectionShell } from './HomeSectionShell';
import { EmptyState } from '@/components/shared/EmptyState';

function WaitingTaskRow({ task }: { task: HomeWaitingTask }) {
  return (
    <li className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
      <span
        className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${getPriorityDotClass(task.priority)}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-content-primary">{task.title}</p>
        <p className="mt-0.5 truncate text-xs text-content-tertiary">
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
        <p className="truncate text-sm font-medium text-content-primary">{link.recipientName}</p>
        <p className="mt-0.5 truncate text-xs text-content-tertiary">
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
  const hasWaiting = tasks.length > 0 || djLinks.length > 0;

  return (
    <HomeSectionShell title="Waiting on others">
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
            {tasks.map((task) => (
              <WaitingTaskRow key={task.id} task={task} />
            ))}
            {djLinks.map((link) => (
              <DjLinkRow key={`${link.showId}-${link.recipientId}`} link={link} />
            ))}
          </ul>
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
