'use client';

import { TeamAvatar } from '@/components/team/TeamAvatar';
import { RowMenu } from '@/components/settings/desk/RowMenu';
import { SettingsDesk } from '@/components/settings/desk/SettingsDesk';
import { isOnline } from '@/lib/presence';
import { teamPresenceLabel } from '@/lib/home/team-presence';
import {
  TEAM_COPY,
  TEAM_ROLE_LABEL,
  dueLabel,
  seatMeter,
  teamSeesLabel,
  type TeamPageResponse,
  type TeamPerson,
} from '@/lib/team-page';

const PEOPLE_COLUMNS =
  'grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_96px_52px_52px_minmax(0,1.6fr)_32px] items-center gap-4 px-5';
const INVITE_COLUMNS = 'grid grid-cols-[minmax(0,1.5fr)_110px_minmax(0,1fr)_auto] items-center gap-4 px-5';

export type InviteAction = 'copy' | 'resend';

/**
 * The Team page on a computer (#1226, founder approved
 * docs/mocks/account-team-desktop): a table you can read down, what each
 * person sees in its own column, and invites in their own list. Every action
 * opens the page's existing sheets (TeamPageClient owns the data and them).
 */
export function TeamDesk({
  data,
  now,
  onOpen,
  onInvite,
  onChangeAccess,
  onRemove,
  onInviteAction,
  inviteBusy,
  notice,
}: {
  data: TeamPageResponse;
  now: Date;
  onOpen: (memberId: string) => void;
  onInvite: () => void;
  onChangeAccess: (memberId: string) => void;
  onRemove: (memberId: string) => void;
  onInviteAction: (person: TeamPerson, action: InviteAction) => void;
  inviteBusy: string | null;
  notice: string | null;
}) {
  const canManage = data.viewer.canManage;
  const active = data.people.filter((person) => person.status === 'active');
  const waiting = data.people.filter((person) => person.status === 'invited');
  const seats = seatMeter(data.seatsUsed, data.seatLimit);
  const seatsLeft = data.seatLimit != null ? Math.max(0, data.seatLimit - data.seatsUsed) : null;

  return (
    <SettingsDesk
      active="team"
      title={TEAM_COPY.title}
      lead={`Who is on ${data.workspace.name || 'your team'}, what they can see, and what they owe next.`}
      actions={
        <>
          <span className="flex items-center gap-2.5 text-[13px] text-content-secondary">
            {seats.share !== null ? (
              <span
                className="relative h-1.5 w-[120px] overflow-hidden rounded-full bg-bg-hover"
                role="meter"
                aria-label="Seats used"
                aria-valuemin={0}
                aria-valuemax={data.seatLimit ?? 0}
                aria-valuenow={data.seatsUsed}
              >
                <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${seats.share}%` }} />
              </span>
            ) : null}
            {seats.line}
          </span>
          {canManage && data.picker && seatsLeft !== 0 ? (
            <button
              type="button"
              onClick={onInvite}
              className="motion-focus motion-press inline-flex h-9 items-center rounded-full bg-content-primary px-4 text-[13px] font-semibold text-bg-base"
            >
              {TEAM_COPY.inviteSomeone}
            </button>
          ) : null}
        </>
      }
    >
      <div className="rounded-2xl border border-stroke-default bg-bg-surface">
        <div className={`${PEOPLE_COLUMNS} border-b border-stroke-default py-3 text-xs font-semibold text-content-tertiary`}>
          <span>Person</span>
          <span>Sees</span>
          <span>Active</span>
          <span>Open</span>
          <span>Late</span>
          <span>Next</span>
          <span className="sr-only">More</span>
        </div>
        <ul aria-label="People on the team">
          {active.map((person) => (
            <PersonRow
              key={person.memberId}
              person={person}
              now={now}
              editable={canManage && person.role !== 'owner' && !person.isCurrentUser}
              onOpen={() => onOpen(person.memberId)}
              onChangeAccess={() => onChangeAccess(person.memberId)}
              onRemove={() => onRemove(person.memberId)}
            />
          ))}
        </ul>
        {active.length <= 1 ? (
          <p className="border-t border-stroke-default px-5 py-4 text-sm text-content-secondary">It is just you for now.</p>
        ) : null}
      </div>

      {waiting.length ? (
        <div className="mt-4 rounded-2xl border border-stroke-default bg-bg-surface">
          <p className="px-5 pb-2 pt-4 text-sm font-semibold text-content-primary">Invited, not joined yet</p>
          <ul aria-label="Invites">
            {waiting.map((person) => (
              <li key={person.memberId} className={`${INVITE_COLUMNS} border-t border-stroke-default py-3`}>
                <span className="flex min-w-0 items-center gap-3">
                  <TeamAvatar initials={person.initials} avatarUrl={null} online={false} size="sm" pending />
                  <span className="truncate text-sm font-semibold text-content-primary">{person.email}</span>
                </span>
                <span className="text-[13px] text-content-secondary">{TEAM_ROLE_LABEL[person.role]}</span>
                <span className="text-[13px] text-content-secondary">
                  {person.invitedAt
                    ? `Invited ${new Date(person.invitedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                    : 'Invited'}
                </span>
                {canManage ? (
                  <span className="flex items-center gap-4">
                    <button
                      type="button"
                      disabled={inviteBusy === person.memberId}
                      onClick={() => onInviteAction(person, 'copy')}
                      className="motion-focus text-sm font-semibold text-brand hover:underline disabled:opacity-60"
                    >
                      Copy link
                    </button>
                    <button
                      type="button"
                      disabled={inviteBusy === person.memberId}
                      onClick={() => onInviteAction(person, 'resend')}
                      className="motion-focus text-sm font-semibold text-brand hover:underline disabled:opacity-60"
                    >
                      Send again
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(person.memberId)}
                      className="motion-focus text-sm font-semibold text-status-error hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
          {notice ? (
            <p role="status" className="border-t border-stroke-default px-5 py-3 text-[13px] text-content-secondary">
              {notice}
            </p>
          ) : null}
        </div>
      ) : null}
    </SettingsDesk>
  );
}

function PersonRow({
  person,
  now,
  editable,
  onOpen,
  onChangeAccess,
  onRemove,
}: {
  person: TeamPerson;
  now: Date;
  editable: boolean;
  onOpen: () => void;
  onChangeAccess: () => void;
  onRemove: () => void;
}) {
  const online = isOnline(person.lastSeenAt, now);
  const next = person.summary.tasks[0] ?? null;
  const limited = person.access.kind !== 'all' && person.role !== 'owner';
  const presence = teamPresenceLabel(person.lastSeenAt, now).replace(/^Active /, '');
  return (
    // The whole row opens their tasks; the name is the keyboard way in.
    <li
      onClick={onOpen}
      className={`${PEOPLE_COLUMNS} cursor-pointer border-t border-stroke-default py-3 first:border-t-0 hover:bg-bg-hover/50`}
    >
      <span className="flex min-w-0 items-center gap-3">
        <TeamAvatar initials={person.initials} avatarUrl={person.avatarUrl} online={online} size="sm" />
        <span className="min-w-0">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
            className="motion-focus block max-w-full truncate text-left text-sm font-semibold text-content-primary hover:underline"
          >
            {person.name}
            {person.isCurrentUser ? ' (you)' : ''}
          </button>
          <span className="block truncate text-xs text-content-secondary">{TEAM_ROLE_LABEL[person.role]}</span>
        </span>
      </span>
      <span className="min-w-0">
        {limited ? (
          <span className="inline-block max-w-full truncate rounded-full bg-bg-hover px-2 py-0.5 text-xs font-semibold text-content-secondary">
            {teamSeesLabel(person.access)}
          </span>
        ) : (
          <span className="text-[13px] text-content-secondary">Everything</span>
        )}
      </span>
      <span className={`truncate text-[13px] ${online ? 'font-medium text-brand' : 'text-content-secondary'}`}>{presence}</span>
      <span className={`text-sm tabular-nums ${person.summary.open ? 'font-semibold text-content-primary' : 'text-content-secondary'}`}>
        {person.summary.open}
      </span>
      <span className={`text-sm tabular-nums ${person.summary.late ? 'font-semibold text-status-error' : 'text-content-secondary'}`}>
        {person.summary.late}
      </span>
      <span className="min-w-0 truncate text-sm">
        {next ? (
          <>
            <span className={next.late ? 'font-semibold text-status-error' : 'text-content-primary'}>{next.title}</span>
            {next.dueDate ? <span className="text-[13px] text-content-secondary"> · {dueLabel(next.dueDate, now)}</span> : null}
          </>
        ) : (
          <span className="text-[13px] text-content-secondary">{TEAM_COPY.nothingAssigned}</span>
        )}
      </span>
      {editable ? (
        <RowMenu
          label={`More for ${person.name}`}
          items={[
            { label: 'Change role', onSelect: onChangeAccess },
            { label: 'Change what they see', onSelect: onChangeAccess },
            { label: 'Remove', danger: true, onSelect: onRemove },
          ]}
        />
      ) : (
        <span />
      )}
    </li>
  );
}
