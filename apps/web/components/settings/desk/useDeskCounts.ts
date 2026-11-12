'use client';

import { useEffect, useState } from 'react';
import { authHeaders } from '@/components/press-kits/press-kit-client';
import { recallLast } from '@/lib/last-seen';
import { registerSignOutReset } from '@/lib/sign-out-resets';
import type { TeamPageResponse } from '@/lib/team-page';

export type DeskCounts = { team: number | null; trash: number | null };

// One read per page life, shared by every settings page the menu is drawn on,
// so moving between them does not fetch the counts again. The Team and Trash
// pages call setDeskCount after their own reads, so the menu follows them.
let cached: DeskCounts | null = null;
let inFlight: Promise<DeskCounts> | null = null;
const listeners = new Set<(counts: DeskCounts) => void>();

registerSignOutReset('settings-desk-counts', () => {
  cached = null;
  inFlight = null;
});

function publish(next: DeskCounts) {
  cached = next;
  for (const listener of listeners) listener(next);
}

/** People on the team (joined, not invites) and rollouts in Trash. */
export function setDeskCount(key: keyof DeskCounts, value: number) {
  publish({ ...(cached ?? { team: null, trash: null }), [key]: value });
}

async function readCounts(): Promise<DeskCounts> {
  const headers = await authHeaders();
  if (!headers) return { team: null, trash: null };
  const remembered = recallLast<TeamPageResponse>('team', 'mine');
  const [team, trash] = await Promise.all([
    remembered
      ? Promise.resolve(remembered.people.filter((person) => person.status === 'active').length)
      : fetch('/api/team', { headers, cache: 'no-store' })
          .then((response) => (response.ok ? (response.json() as Promise<TeamPageResponse>) : null))
          .then((body) => (body ? body.people.filter((person) => person.status === 'active').length : null))
          .catch(() => null),
    fetch('/api/releases/trash', { headers, cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<{ items?: unknown[] }>) : null))
      .then((body) => (body ? (body.items ?? []).length : null))
      .catch(() => null),
  ]);
  return { team, trash };
}

export function useDeskCounts(signedIn: boolean): DeskCounts {
  const [counts, setCounts] = useState<DeskCounts>(() => cached ?? { team: null, trash: null });
  useEffect(() => {
    listeners.add(setCounts);
    if (signedIn && !cached) {
      inFlight ??= readCounts().finally(() => {
        inFlight = null;
      });
      void inFlight.then((next) => {
        // A page's own read may have landed first; keep its numbers.
        publish({ team: cached?.team ?? next.team, trash: cached?.trash ?? next.trash });
      });
    }
    return () => {
      listeners.delete(setCounts);
    };
  }, [signedIn]);
  return counts;
}
