'use client';

import { useEffect, useState } from 'react';
import { recallLast, rememberLast } from '@/lib/last-seen';
import { authHeaders } from '@/components/press-kits/press-kit-client';
import { TASKS_CHANGED_EVENT } from '@/components/tasks/TaskUIProvider';
import type { TeamPageResponse } from '@/lib/team-page';

/**
 * The Team page's own read (GET /api/team), for other screens that show the
 * team (Home on a computer, #1182). Same data, same access rules, and the same
 * in-memory copy the Team page keeps, so opening Team after Home paints at once.
 * `failed` is true when the read settled with nothing to show.
 */
export function useTeamPage(): { data: TeamPageResponse | null; failed: boolean } {
  const [data, setData] = useState<TeamPageResponse | null>(() => recallLast<TeamPageResponse>('team', 'mine'));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    const read = async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const response = await fetch('/api/team', { headers, cache: 'no-store' });
        if (!live) return;
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const next = (await response.json()) as TeamPageResponse;
        rememberLast('team', 'mine', next);
        if (live) setData(next);
      } catch {
        if (live) setFailed(true);
      }
    };
    void read();
    // A task ticked off on this screen changes someone's open and late counts.
    const onTasksChanged = () => void read();
    window.addEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
    return () => {
      live = false;
      window.removeEventListener(TASKS_CHANGED_EVENT, onTasksChanged);
    };
  }, []);

  return { data, failed: failed && !data };
}
