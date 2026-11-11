'use client';

// Team on Home, on a computer only (#1182, mock docs/mocks/home-tighter,
// note 8): one row of people, each with their role and how much is on them.
// The data is the Team page's own (GET /api/team), so the counts are the same
// numbers the Team page shows and follow the viewer's own access limits.
// A person opens on the Team page with their tasks beside them.

import Link from 'next/link';
import { Plus } from '@/components/icons';
import { ProfileFace } from '@/components/shared/ProfileFace';
import { TEAM_COPY, TEAM_HREF, TEAM_ROLE_LABEL, type TeamPageResponse } from '@/lib/team-page';

/** Tiles in the row, the invite tile included. */
const SLOTS = 5;

export const teamPersonHref = (memberId: string) => `${TEAM_HREF}?person=${encodeURIComponent(memberId)}`;
export const TEAM_INVITE_HREF = `${TEAM_HREF}?invite=1`;

const TILE = 'flex min-w-0 items-center gap-3 rounded-[14px] px-4 py-3.5';

export function HomeTeamHead({ count }: { count: number | null }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="font-display text-[22px] font-normal leading-7 text-content-primary">
        Team
        {count !== null ? (
          <span className="font-sans text-sm font-medium text-content-secondary">
            {' '}
            · {count === 1 ? '1 person' : `${count} people`}
          </span>
        ) : null}
      </h2>
      <Link href={TEAM_HREF} className="motion-focus text-[13px] font-semibold text-brand underline underline-offset-[3px]">
        Open team
      </Link>
    </div>
  );
}

function Load({ open, late }: { open: number; late: number }) {
  if (open === 0) return <span className="block text-xs leading-4 text-content-secondary">Nothing open</span>;
  return (
    <span className="block text-xs leading-4 text-content-secondary">
      {open} open
      {late > 0 ? (
        <>
          {' · '}
          <span className="font-semibold text-status-error">{late} late</span>
        </>
      ) : null}
    </span>
  );
}

export function HomeTeamRow({
  team,
  mine,
}: {
  team: TeamPageResponse;
  /** The viewer's own load as My tasks counts it, shown on their tile. */
  mine?: { open: number; late: number };
}) {
  const active = team.people.filter((person) => person.status === 'active');
  // You first, then the Team page's own order (online, then most recent).
  const people = [...active.filter((person) => person.isCurrentUser), ...active.filter((person) => !person.isCurrentUser)];
  const seatsLeft = team.seatLimit != null ? Math.max(0, team.seatLimit - team.seatsUsed) : null;
  const canInvite = team.viewer.canManage && seatsLeft !== 0;
  const room = SLOTS - (canInvite ? 1 : 0);
  const overflow = people.length > room;
  const shown = overflow ? people.slice(0, room - 1) : people;
  const more = people.length - shown.length;

  return (
    <section data-home-block="team" aria-label="Team">
      <HomeTeamHead count={people.length} />
      <ul className="mt-3 grid grid-cols-5 gap-3">
        {shown.map((person) => (
          <li key={person.memberId} className="min-w-0">
            <Link
              href={teamPersonHref(person.memberId)}
              className={`motion-focus motion-press ${TILE} h-full border border-stroke-default bg-bg-surface transition-colors hover:bg-bg-hover/60`}
            >
              <ProfileFace name={person.name} photoUrl={person.avatarUrl} size={40} />
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-content-primary">{person.name}</span>
                  {person.isCurrentUser ? (
                    <span className="shrink-0 rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold leading-[18px] text-brand">
                      You
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs leading-4 text-content-secondary">{TEAM_ROLE_LABEL[person.role]}</span>
                <Load {...(person.isCurrentUser && mine ? mine : person.summary)} />
              </span>
            </Link>
          </li>
        ))}
        {overflow ? (
          <li className="min-w-0">
            <Link
              href={TEAM_HREF}
              className={`motion-focus motion-press ${TILE} h-full border border-stroke-default bg-bg-surface text-sm font-semibold text-content-primary hover:bg-bg-hover/60`}
            >
              {more} more
            </Link>
          </li>
        ) : null}
        {canInvite ? (
          <li className="min-w-0">
            <Link
              href={TEAM_INVITE_HREF}
              className={`motion-focus motion-press ${TILE} h-full border-[1.5px] border-dashed border-stroke-control hover:bg-bg-hover/60`}
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-stroke-control text-content-tertiary"
                aria-hidden="true"
              >
                <Plus className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-content-primary">{TEAM_COPY.inviteSomeone}</span>
                {seatsLeft !== null ? (
                  <span className="block text-xs leading-4 text-content-secondary">
                    {seatsLeft === 1 ? '1 seat left' : `${seatsLeft} seats left`}
                  </span>
                ) : null}
              </span>
            </Link>
          </li>
        ) : people.length <= 1 ? (
          <li className="col-span-2 flex items-center px-1 text-sm text-content-secondary">It is just you for now.</li>
        ) : null}
      </ul>
    </section>
  );
}

/** The row's shape while the team loads. */
export function HomeTeamRowSkeleton() {
  return (
    <section aria-hidden="true">
      <HomeTeamHead count={null} />
      <ul className="mt-3 grid grid-cols-5 gap-3">
        {[0, 1, 2].map((key) => (
          <li key={key} className={`${TILE} border border-stroke-default bg-bg-surface`}>
            <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-hover" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-3.5 w-20 animate-pulse rounded bg-bg-hover" />
              <span className="block h-3 w-12 animate-pulse rounded bg-bg-hover" />
              <span className="block h-3 w-14 animate-pulse rounded bg-bg-hover" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
