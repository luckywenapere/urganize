'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { TaskNotification } from '@/lib/tasks';

// "Needs you" for the swipe navigation (URG-380): the bell is gone, so the
// unread notices the bell used to hold show as one turn at the end of UrgAns'
// Main thread, with a dot on the UrgAns tab while you are elsewhere. Same API
// as the bell (GET /api/notifications, PATCH /api/notifications/read), same
// rows, no new table and nothing written but "read".

type NeedsYouState = {
  items: TaskNotification[];
  loaded: boolean;
  load: () => Promise<void>;
  markRead: (ids: string[] | 'all') => Promise<void>;
};

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

let inFlight: Promise<void> | null = null;

export const useNeedsYouStore = create<NeedsYouState>((set, get) => ({
  items: [],
  loaded: false,
  load: () => {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      try {
        const access = await token();
        if (!access) return;
        const response = await fetch('/api/notifications', {
          headers: { Authorization: `Bearer ${access}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const data = (await response.json().catch(() => ({}))) as { notifications?: TaskNotification[] };
        set({ items: Array.isArray(data.notifications) ? data.notifications : [], loaded: true });
      } catch {
        // Best effort: the last list stays.
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },
  markRead: async (ids) => {
    set({
      items: get().items.map((item) =>
        item.read || (ids !== 'all' && !ids.includes(item.id)) ? item : { ...item, read: true }
      ),
    });
    try {
      const access = await token();
      if (!access) return;
      await fetch('/api/notifications/read', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(ids === 'all' ? {} : { notificationIds: ids }),
      });
    } catch {
      void get().load();
    }
  },
}));

export const selectUnread = (state: NeedsYouState) => state.items.filter((item) => !item.read);
