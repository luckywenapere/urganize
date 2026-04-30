'use client';

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
