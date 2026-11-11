'use client';

// Tasks on Home, on a computer (#1182, mock docs/mocks/home-tighter, note 7):
// "My tasks" on the left, "Delegated" on the right. The picking and ordering
// is lib/home-desktop/tasks.ts. Ticking goes through TaskCompletionCheckbox,
// the same path every task list uses, so blockers and the unlock of the tasks
// that wait on this one still apply.

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ProfileFace } from '@/components/shared/ProfileFace';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import type { ExecutionTask } from '@/lib/execution-types';
import { homeDueLabel, type HomeTaskPick, type HomeTaskRow } from '@/lib/home-desktop/tasks';
import { displayReleaseTitle } from '@/types/releases';

export type HomeTaskPlace = { title: string; artistName: string };
export type HomeTaskPerson = { name: string; photoUrl: string | null };

type CardProps = {
  pick: HomeTaskPick<ExecutionTask>;
  today: string;
  /** Rollout title and artist by rollout id, for the line under a task. */
  places: ReadonlyMap<string, HomeTaskPlace>;
  seeAllHref: string;
};

function TaskCard({
  title,
  open,
  seeAllHref,
  children,
  block,
}: {
  title: string;
  open: number;
  seeAllHref: string;
  children: ReactNode;
  block: string;
}) {
  return (
    <section
      className="min-w-0 rounded-2xl border border-stroke-default bg-bg-surface px-5 pb-2 pt-1.5"
      data-home-block={block}
      aria-label={title}
    >
      <div className="flex items-baseline justify-between gap-3 pb-2 pt-3">
        <h2 className="font-display text-lg font-normal leading-6 text-content-primary">
          {title}
          {open > 0 ? <span className="font-sans text-[13px] font-medium text-content-secondary"> · {open} open</span> : null}
        </h2>
        {open > 0 ? (
          <Link href={seeAllHref} className="motion-focus text-[13px] font-semibold text-brand underline underline-offset-[3px]">
            See all
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="border-t border-stroke-subtle py-5 text-sm text-content-secondary">{children}</div>;
}

function placeParts(task: ExecutionTask, places: ReadonlyMap<string, HomeTaskPlace>): string[] {
  const place = task.releaseId ? places.get(task.releaseId) : null;
  if (place) return [displayReleaseTitle(place.title), place.artistName].filter(Boolean);
  if (task.release) return [displayReleaseTitle(task.release.title), task.release.artistName].filter(Boolean);
  return task.record?.title ? [task.record.title] : [];
}

function Due({ row, today }: { row: HomeTaskRow<ExecutionTask>; today: string }) {
  if (row.doneToday) return <span className="shrink-0 text-[13px] font-semibold text-brand">Done today</span>;
  const due = homeDueLabel(row.task.dueDate, today);
  return (
    <span className={`shrink-0 text-[13px] ${due.late ? 'font-semibold text-status-error' : 'text-content-secondary'}`}>
      {due.text}
    </span>
  );
}

function RowText({ row, under }: { row: HomeTaskRow<ExecutionTask>; under: string }) {
  const { openTask } = useTaskUI();
  return (
    <button type="button" onClick={() => openTask(row.id)} className="motion-focus min-w-0 flex-1 rounded-md text-left">
      <span
        className={`block truncate text-sm font-semibold ${
          row.doneToday ? 'text-content-secondary line-through' : 'text-content-primary'
        }`}
      >
        {row.task.title}
      </span>
      {under ? <span className="block truncate text-xs leading-4 text-content-secondary">{under}</span> : null}
    </button>
  );
}

/** Open tasks assigned to the viewer. Each can be ticked off here. */
export function MyTasksCard({ pick, today, places, seeAllHref }: CardProps) {
  // A refusal ("finish X first") belongs to the list it was shown against:
  // once the rows change it is stale, so it is kept with the rows it was for.
  const shownFor = pick.rows.map((row) => row.id).join();
  const [refusal, setRefusal] = useState<{ text: string; rows: string } | null>(null);
  const blocker = refusal && refusal.rows === shownFor ? refusal.text : null;
  const setBlocker = (text: string) => setRefusal({ text, rows: shownFor });
  return (
    <TaskCard title="My tasks" open={pick.open} seeAllHref={seeAllHref} block="my-tasks">
      {pick.rows.length === 0 ? (
        <EmptyLine>Nothing is assigned to you right now.</EmptyLine>
      ) : (
        <ul>
          {pick.rows.map((row) => (
            <li key={row.id} className="flex min-w-0 items-center gap-3 border-t border-stroke-subtle py-2.5">
              <TaskCompletionCheckbox
                taskId={row.id}
                status={row.task.status}
                taskTitle={row.task.title}
                onBlocker={setBlocker}
                className="!h-5 !w-5"
              />
              <RowText row={row} under={placeParts(row.task, places).join(' · ')} />
              <Due row={row} today={today} />
            </li>
          ))}
        </ul>
      )}
      {blocker ? (
        <p role="alert" className="border-t border-stroke-subtle py-2.5 text-[13px] text-status-error">
          {blocker}
        </p>
      ) : null}
    </TaskCard>
  );
}

/** Open tasks the viewer gave to someone else: who has it and when it is due. */
export function DelegatedCard({
  pick,
  today,
  places,
  seeAllHref,
  people,
  alone,
  inviteHref,
}: CardProps & {
  /** Faces and names by user id, from the team. */
  people: ReadonlyMap<string, HomeTaskPerson>;
  /** True when the viewer is the only person on the team. */
  alone: boolean;
  /** Where to invite someone, for a viewer who may. Null otherwise. */
  inviteHref: string | null;
}) {
  return (
    <TaskCard title="Delegated" open={pick.open} seeAllHref={seeAllHref} block="delegated">
      {pick.rows.length === 0 ? (
        <EmptyLine>
          {alone ? 'It is just you for now, so there is nobody to hand work to.' : 'You have not given anyone a task.'}
          {alone && inviteHref ? (
            <>
              {' '}
              <Link href={inviteHref} className="motion-focus font-semibold text-brand underline underline-offset-[3px]">
                Invite someone
              </Link>
            </>
          ) : null}
        </EmptyLine>
      ) : (
        <ul>
          {pick.rows.map((row) => {
            const person = people.get(row.task.assignedToUserId ?? '');
            const name = person?.name || row.task.assignee?.name || row.task.assignedTo || 'A teammate';
            const rollout = placeParts(row.task, places)[0];
            return (
              <li key={row.id} className="flex min-w-0 items-center gap-3 border-t border-stroke-subtle py-2.5">
                <ProfileFace name={name} photoUrl={person?.photoUrl ?? null} size={28} />
                <RowText row={row} under={[name, rollout].filter(Boolean).join(' · ')} />
                <Due row={row} today={today} />
              </li>
            );
          })}
        </ul>
      )}
    </TaskCard>
  );
}
