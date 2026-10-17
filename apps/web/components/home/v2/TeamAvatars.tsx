'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { isOnline } from '@/lib/presence';
import { useSettingsLinkClick } from '@/components/settings/useOpenSettings';
import { HOME_TEAM_COPY, HOME_TEAM_HREF, teamPresenceLabel, type TeamPresenceMember } from '@/lib/home/team-presence';

const TINTS = ['bg-[#7fd99a]', 'bg-[#e7c27d]', 'bg-[#9ab8f0]', 'bg-[#e9a3c9]'];
const SHOWN = 3;

/**
 * The team, as faces at the top right of Home (URG-320, replacing the Your team
 * card of URG-250): up to three, a green dot on whoever is online now. Tap for
 * the list with when each was last in. Draws nothing until someone else joins.
 */
export function TeamAvatars({ members }: { members: readonly TeamPresenceMember[] }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  // Manage team opens Settings over Home itself (2026-10-17). Its plain href was
  // `/dashboard?settings=team`, which left Home for the Artists page under the
  // pop-up, so closing Settings landed on Artists instead of back on Home.
  const openTeam = useSettingsLinkClick({ segment: 'team' }, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (members.length === 0) return null;
  const shown = members.slice(0, SHOWN);
  const extra = members.length - shown.length;
  const onlineCount = members.filter((m) => isOnline(m.lastSeenAt, now)).length;

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${HOME_TEAM_COPY.label}: ${members.length}${onlineCount ? `, ${onlineCount} online now` : ''}`}
        className="motion-focus flex min-h-11 items-center pl-2"
      >
        {shown.map((member, index) => (
          <span
            key={member.userId}
            className={`relative -ml-2 grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-bg-base text-[9.5px] font-bold tracking-tight text-content-inverse ${TINTS[index % TINTS.length]}`}
          >
            {member.initials}
            {isOnline(member.lastSeenAt, now) ? (
              <span className="absolute -bottom-px -right-px h-[9px] w-[9px] rounded-full border-2 border-bg-base bg-brand" />
            ) : null}
          </span>
        ))}
        {extra > 0 ? (
          <span className="-ml-2 grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-bg-base bg-bg-elevated text-[10px] font-semibold text-content-secondary">
            +{extra}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={listId}
          className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-2xl border border-stroke-default bg-bg-elevated py-1 shadow-xl"
        >
          <ul>
            {members.map((member) => (
              <li key={member.userId} className="flex min-h-11 items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-content-primary">{member.name}</span>
                <span className="shrink-0 text-xs text-content-primary/55">{teamPresenceLabel(member.lastSeenAt, now)}</span>
              </li>
            ))}
          </ul>
          <Link
            href={HOME_TEAM_HREF}
            onClick={openTeam}
            className="motion-focus flex min-h-11 items-center border-t border-stroke-subtle px-4 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            {HOME_TEAM_COPY.manage}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
