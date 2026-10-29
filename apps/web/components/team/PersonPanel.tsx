'use client';

import Link from 'next/link';
import { isOnline } from '@/lib/presence';
import { teamPresenceLabel } from '@/lib/home/team-presence';
import {
  TEAM_ROLE_LABEL,
  accessSentence,
  dueLabel,
  groupTasks,
  type TeamPerson,
  type TeamTask,
} from '@/lib/team-page';
import { TeamAvatar } from './TeamAvatar';

/**
 * One person's tasks across every rollout, late first (issue #853). Opened from
 * their card (computer) or row (phone). Ticking a task is left out on purpose:
 * you work tasks in their rollout, so each one links there.
 */
export function PersonPanel({
  person,
  now,
  canManage,
  onChangeAccess,
  onRemove,
}: {
  person: TeamPerson;
  now: Date;
  canManage: boolean;
  onChangeAccess: () => void;
  onRemove: () => void;
}) {
  const online = isOnline(person.lastSeenAt, now);
  const groups = groupTasks(person.summary.tasks, now);
  const editable = canManage && person.role !== 'owner' && !person.isCurrentUser;

  return (
    <div>
      <div className="flex items-center gap-3 pr-12">
        <TeamAvatar initials={person.initials} avatarUrl={person.avatarUrl} online={online} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold text-content-primary">{person.name}</p>
          <p className="truncate text-[13px] text-content-secondary">
            {TEAM_ROLE_LABEL[person.role]} · {person.status === 'invited' ? 'Invited' : teamPresenceLabel(person.lastSeenAt, now)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Open" value={person.summary.open} />
        <Stat label="Late" value={person.summary.late} danger={person.summary.late > 0} />
        <Stat label="Done 7d" value={person.summary.doneThisWeek} />
      </dl>

      {person.summary.open === 0 ? (
        <p className="mt-6 text-sm text-content-secondary">
          {person.status === 'invited' ? 'They can be given tasks once they join.' : 'Nothing assigned right now.'}
        </p>
      ) : (
        <>
          <TaskGroup title="Late" tasks={groups.late} now={now} danger />
          <TaskGroup title="This week" tasks={groups.week} now={now} />
          <TaskGroup title="Later" tasks={groups.later} now={now} />
        </>
      )}

      {person.role !== 'owner' ? (
        <div className="mt-5 rounded-xl bg-bg-base p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-content-tertiary">Access</p>
          <p className="mt-1 text-[13.5px] text-content-primary">{person.role === 'manager' ? 'All rollouts' : accessSentence(person.access)}</p>
        </div>
      ) : null}

      {editable ? (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onChangeAccess}
            className="motion-focus motion-press inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-stroke-control text-sm font-semibold text-content-primary"
          >
            Change role or access
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="motion-focus motion-press inline-flex h-10 items-center justify-center rounded-xl border border-status-error/35 px-4 text-sm font-semibold text-status-error"
          >
            {person.status === 'invited' ? 'Cancel invite' : 'Remove'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-bg-base px-3 py-2">
      <dd className={`font-mono text-[17px] tabular-nums ${danger ? 'text-status-error' : 'text-content-primary'}`}>{value}</dd>
      <dt className="text-[11.5px] text-content-secondary">{label}</dt>
    </div>
  );
}

function TaskGroup({ title, tasks, now, danger = false }: { title: string; tasks: TeamTask[]; now: Date; danger?: boolean }) {
  if (!tasks.length) return null;
  return (
    <section className="mt-5">
      <h3 className={`text-[11px] font-medium uppercase tracking-[0.08em] ${danger ? 'text-status-error' : 'text-content-tertiary'}`}>
        {title}
        {title === 'Later' ? ` · ${tasks.length}` : ''}
      </h3>
      <ul className="mt-1">
        {tasks.map((task) => (
          <li key={task.id} className="border-t border-stroke-default first:border-t-0">
            <Link
              href={task.releaseId ? `/dashboard?release=${encodeURIComponent(task.releaseId)}` : '/dashboard'}
              className="motion-focus flex gap-3 py-2.5"
            >
              <span className="mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border-[1.5px] border-stroke-control" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[13.5px] text-content-primary">{task.title}</span>
                <span className="block truncate text-xs text-content-secondary">
                  {[task.artistName, task.releaseTitle ? `"${task.releaseTitle}"` : null].filter(Boolean).join(' · ')}
                  {task.dueDate ? (
                    <>
                      {task.artistName || task.releaseTitle ? ' · ' : ''}
                      <span className={task.late ? 'text-status-error' : undefined}>due {dueLabel(task.dueDate, now)}</span>
                    </>
                  ) : null}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
