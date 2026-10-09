'use client';

import { create } from 'zustand';
import { useEffect } from 'react';
import { loadSpend } from '@/lib/release-spend-client';

/**
 * Whether the signed-in person may see a rollout's spend, so the rollout menu
 * can decide whether to show its Spend row at all.
 *
 * The answer comes from the same route the Spend section reads (a 200 that says
 * `canView: false` for a team member without access, never an error), which in
 * turn asks the one database rule. The ROW is a convenience; the section and
 * the server both ask again, so a stale `true` here can only ever lead to the
 * "only the owner and team managers can see this" panel, never to a cost.
 *
 * `null`/absent means "not known yet" and shows nothing: a cost row that appears
 * for a moment and then vanishes is worse than one that arrives a moment late.
 * A failed read is left unknown and tried again on the next visit. Held in
 * memory only, and cleared on sign-out.
 */
type SpendAccessState = {
  byRelease: Record<string, boolean>;
  probe: (releaseId: string) => Promise<void>;
  reset: () => void;
};

const inFlight = new Set<string>();

export const useSpendAccessStore = create<SpendAccessState>((set, get) => ({
  byRelease: {},
  probe: async (releaseId) => {
    if (!releaseId || releaseId in get().byRelease || inFlight.has(releaseId)) return;
    inFlight.add(releaseId);
    try {
      const result = await loadSpend(releaseId);
      if (result.ok) {
        set((state) => ({ byRelease: { ...state.byRelease, [releaseId]: result.value.canView === true } }));
      }
    } finally {
      inFlight.delete(releaseId);
    }
  },
  reset: () => {
    inFlight.clear();
    set({ byRelease: {} });
  },
}));

/** True once the server has said this person may see the rollout's spend. */
export function useCanViewSpend(releaseId: string | null): boolean {
  const known = useSpendAccessStore((state) => (releaseId ? state.byRelease[releaseId] : undefined));
  const probe = useSpendAccessStore((state) => state.probe);
  useEffect(() => {
    if (releaseId) void probe(releaseId);
  }, [releaseId, probe]);
  return known === true;
}

export function resetSpendAccess(): void {
  useSpendAccessStore.getState().reset();
}
