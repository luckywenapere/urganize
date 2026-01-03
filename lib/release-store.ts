import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReleaseState, Release } from '@/types';

export const useReleaseStore = create<ReleaseState>()(
  persist(
    (set, get) => ({
      releases: [],
      currentRelease: null,

      addRelease: (releaseData) => {
        const newRelease: Release = {
          ...releaseData,
          id: Date.now().toString(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        set((state) => ({
          releases: [...state.releases, newRelease],
          currentRelease: newRelease,
        }));
      },

      updateRelease: (id, updates) => {
        set((state) => ({
          releases: state.releases.map((release) =>
            release.id === id
              ? { ...release, ...updates, updatedAt: new Date() }
              : release
          ),
          currentRelease:
            state.currentRelease?.id === id
              ? { ...state.currentRelease, ...updates, updatedAt: new Date() }
              : state.currentRelease,
        }));
      },

      deleteRelease: (id) => {
        set((state) => ({
          releases: state.releases.filter((release) => release.id !== id),
          currentRelease:
            state.currentRelease?.id === id ? null : state.currentRelease,
        }));
      },

      setCurrentRelease: (id) => {
        const release = get().releases.find((r) => r.id === id);
        set({ currentRelease: release || null });
      },
    }),
    {
      name: 'release-storage',
    }
  )
);
