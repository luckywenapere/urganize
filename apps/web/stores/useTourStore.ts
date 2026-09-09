'use client';

import { create } from 'zustand';

import type { TourId, TourStep } from '@/lib/tours';

/**
 * The running tour, and a replay request waiting to be picked up.
 *
 * A store rather than props for the usePlannerStore reason: the two things
 * that START a tour (the auto-start hook inside WorkspaceView, and the two
 * replay entry points in the HelpMenu and Settings) sit in different ownership
 * islands from the overlay, which AppShell mounts once.
 *
 * `pendingReplay` exists because a replay can be asked for from a page the
 * tour cannot run on. Settings has no catalog to point at, so the request is
 * parked here, the caller navigates, and useCatalogTourAutoStart consumes it
 * on arrival. It is a REQUEST, not a running tour — which is why
 * `blocksPrompts` counts it: the first-release prompt must not fire into the
 * gap between asking for a tour and landing where it runs.
 */
export type ActiveTour = {
  tourId: TourId;
  stepIndex: number;
  steps: readonly TourStep[];
};

type TourState = {
  active: ActiveTour | null;
  pendingReplay: TourId | null;
  start: (tourId: TourId, steps: readonly TourStep[]) => void;
  next: () => void;
  skip: () => void;
  finish: () => void;
  requestReplay: (tourId: TourId) => void;
  consumeReplay: (tourId: TourId) => boolean;
};

export const useTourStore = create<TourState>((set, get) => ({
  active: null,
  pendingReplay: null,
  // Starting always clears any pending replay: this IS the replay being
  // honoured in the case that matters, and a stale request left behind would
  // re-run the tour the next time the hook looked.
  start: (tourId, steps) =>
    set({ active: steps.length ? { tourId, stepIndex: 0, steps } : null, pendingReplay: null }),
  next: () =>
    set((state) => {
      if (!state.active) return state;
      const nextIndex = state.active.stepIndex + 1;
      if (nextIndex >= state.active.steps.length) return { ...state, active: null };
      return { ...state, active: { ...state.active, stepIndex: nextIndex } };
    }),
  skip: () => set({ active: null }),
  finish: () => set({ active: null }),
  requestReplay: (tourId) => set({ pendingReplay: tourId }),
  consumeReplay: (tourId) => {
    if (get().pendingReplay !== tourId) return false;
    set({ pendingReplay: null });
    return true;
  },
}));

/** Imperative read for callers outside React — the first-release prompt's
 *  fire-time guard runs in a timer callback, not a render. */
export function isTourRunning(): boolean {
  return useTourStore.getState().active !== null;
}

/** A tour is running OR one has been asked for and not yet reached. Both must
 *  hold back anything that would interrupt. */
export function tourBlocksPrompts(): boolean {
  const state = useTourStore.getState();
  return state.active !== null || state.pendingReplay !== null;
}
