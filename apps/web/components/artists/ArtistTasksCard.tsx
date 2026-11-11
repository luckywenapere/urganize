'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ProfileFace } from '@/components/shared/ProfileFace';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { releaseHref } from '@/lib/artist-page';
import { artistTaskList } from '@/lib/artist-page-data';
import { useAuthStore } from '@/lib/auth-store';
import type { ExecutionTask } from '@/lib/execution-types';
import { displayReleaseTitle } from '@/types/releases';

// The tasks card on the artist page, desktop only (#1183, mock
// docs/mocks/artist-page-desktop, note 6): the open tasks on this artist's
// rollouts, late first, each with who has it. Your own task (and one nobody
// has yet) gets the tick circle, which finishes it the same way every other
// tick in the app does; a teammate's shows their face. The rules are
// lib/artist-page-data.ts (artistTaskList). Self-contained on purpose: Home is
// getting task cards of its own, and the two rows can be merged later.

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function ArtistTasksCard({
  tasks,
  releases,
  today,
  className = '',
}: {
  /** Every task the page holds; the card picks this artist's. */
  tasks: readonly ExecutionTask[];
  /** This artist's rollouts. */
  releases: readonly { id: string; title: string }[];
  /** YYYY-MM-DD, Lagos. */
  today: string;
  className?: string;
}) {
  const viewerId = useAuthStore((state) => state.user?.id ?? null);
  const { openTask } = useTaskUI();
  const titles = useMemo(() => new Map(releases.map((release) => [release.id, displayReleaseTitle(release.title)])), [releases]);
  const list = useMemo(
    () => artistTaskList({ tasks, releaseIds: titles.keys(), today, viewerId }),
    [tasks, titles, today, viewerId]
  );

  const counts = [
    list.dueThisWeek > 0 ? `${list.dueThisWeek} due this week` : null,
    list.late > 0 ? `${list.late} late` : null,
  ].filter(Boolean);
  const first = list.rows[0];

  return (
    <section aria-labelledby="artist-tasks-title" className={`rounded-2xl border border-stroke-default bg-bg-surface px-5 pb-2 pt-1.5 ${className}`}>
      <div className="flex items-baseline justify-between gap-3 pb-2 pt-3">
        <h2 id="artist-tasks-title" className="font-display text-lg leading-6 text-content-primary">
          Tasks
          {counts.length > 0 ? (
            <span className="font-sans text-[13px] font-medium text-content-secondary"> · {counts.join(', ')}</span>
          ) : null}
        </h2>
        {first?.task.releaseId ? (
          <Link
            href={releaseHref(first.task.releaseId)}
            className="motion-focus shrink-0 rounded text-[13px] font-semibold text-brand underline underline-offset-[3px] hover:no-underline"
          >
            See all<span className="sr-only"> {plural(list.open, 'open task')}</span>
          </Link>
        ) : null}
      </div>

      {list.rows.length === 0 ? (
        <p className="border-t border-stroke-default py-3.5 text-sm text-content-secondary">
          {releases.length === 0 ? 'Tasks show up here once a rollout is planned.' : 'No open tasks.'}
        </p>
      ) : (
        <ul>
          {list.rows.map(({ task, dueLabel, late, owner }) => {
            const who = owner === 'viewer' ? 'You' : owner === 'nobody' ? 'Nobody yet' : task.assignee?.name || 'A teammate';
            const rollout = task.releaseId ? titles.get(task.releaseId) : null;
            return (
              <li key={task.id} className="relative flex min-w-0 items-center gap-3 border-t border-stroke-default py-2.5">
                {/* One 28px slot, so the titles line up whichever it holds. */}
                <span className="grid h-7 w-7 shrink-0 place-items-center">
                  {owner === 'other' ? (
                    <ProfileFace name={who} photoUrl={task.assignee?.avatarUrl} size={28} />
                  ) : (
                    // Above the row-wide button, so ticking never opens the task.
                    <TaskCompletionCheckbox taskId={task.id} status={task.status} taskTitle={task.title} className="relative z-10" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openTask(task.id)}
                    className="motion-focus block w-full truncate rounded text-left text-sm font-semibold text-content-primary after:absolute after:inset-0 after:content-[''] hover:text-brand"
                  >
                    {task.title}
                  </button>
                  <p className="truncate text-xs leading-4 text-content-secondary">{[rollout, who].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={`shrink-0 whitespace-nowrap text-[13px] ${late ? 'font-semibold text-status-error' : 'text-content-secondary'}`}>
                  {dueLabel}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
