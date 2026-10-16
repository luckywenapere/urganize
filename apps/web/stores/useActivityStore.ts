'use client';

import { registerSignOutReset } from '@/lib/sign-out-resets';
import { create } from 'zustand';
import type { ActivityLogEntry } from '@/lib/execution-types';

type ActivityStore = {
  activity: ActivityLogEntry[];
  setActivity: (activity: ActivityLogEntry[]) => void;
  addLocalActivity: (entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>) => void;
};

export const useActivityStore = create<ActivityStore>((set) => ({
  activity: [],
  setActivity: (activity) => set({ activity }),
  addLocalActivity: (entry) =>
    set((state) => ({
      activity: [
        {
          ...entry,
          id: `local_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
        },
        ...state.activity,
      ].slice(0, 20),
    })),
}));

/**
 * Forget the signed-in account's activity feed. Called on SIGNED_OUT
 * (lib/auth-store.ts) — the same exposure as the release and task stores it
 * loads alongside: module-level, so a same-tab account switch would otherwise
 * leave account A's recent activity on screen for account B.
 */
export function resetActivityStore(): void {
  useActivityStore.setState({ activity: [] });
}

// Sign-out: see lib/sign-out-resets.ts (runs from lib/auth-store.ts).
registerSignOutReset('activity', resetActivityStore);
