'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from '@/components/icons';
import { supabase } from '@/lib/supabase/client';
import { PING_INTERVAL_MS, isOnline } from '@/lib/presence';
import {
  HOME_TEAM_COPY,
  HOME_TEAM_HREF,
  teamPresenceLabel,
  type TeamPresenceMember,
  type TeamPresenceResponse,
} from '@/lib/home/team-presence';

async function loadTeamPresence(): Promise<TeamPresenceMember[] | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  if (!token) return null;
  try {
    const response = await fetch('/api/home/team', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<TeamPresenceResponse>;
    return Array.isArray(body.members) ? body.members : [];
  } catch {
    return null;
  }
}

/**
 * Home's "Your team" card (URG-250, 2026-10-15): everyone else on the team with
 * when they were last in the app. Rules in lib/home/team-presence.ts. Shows only
 * once someone else has joined, re-reads every ping interval while the tab is
 * visible, and keeps the last good list if a read fails. Live, no flag.
 */
export function TeamPresenceCard() {
  const headingId = useId();
  const [members, setMembers] = useState<TeamPresenceMember[] | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let live = true;
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadTeamPresence().then((next) => {
        if (!live) return;
        if (next) setMembers(next);
        setNow(new Date());
      });
    };
    refresh();
    const timer = window.setInterval(refresh, PING_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  if (!members || members.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="relative pt-3.5" data-home-card="team">
      <h2 className="absolute left-3 top-0 z-20">
        <span
          id={headingId}
          className="inline-flex h-7 items-center rounded-full border border-stroke-default bg-bg-base px-2.5 text-[11px] font-semibold text-content-secondary"
        >
          {HOME_TEAM_COPY.label}
        </span>
      </h2>

      <div className="relative z-10 rounded-2xl border border-stroke-default bg-bg-surface px-4 pb-2 pt-6">
        <ul className="divide-y divide-stroke-subtle">
          {members.map((member) => {
            const online = isOnline(member.lastSeenAt, now);
            return (
              <li key={member.userId} className="flex min-h-11 items-center gap-3 py-2.5">
                <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-base text-[11px] font-semibold text-content-secondary">
                  {member.initials}
                  {online ? (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-surface bg-status-success"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-content-primary">{member.name}</span>
                <span
                  className={`shrink-0 text-xs tabular-nums ${online ? 'font-semibold text-status-success' : 'text-content-tertiary'}`}
                >
                  {teamPresenceLabel(member.lastSeenAt, now)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end border-t border-stroke-subtle pt-1">
          <Link
            href={HOME_TEAM_HREF}
            className="motion-focus inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            {HOME_TEAM_COPY.manage}
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
