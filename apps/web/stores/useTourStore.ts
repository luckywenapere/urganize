'use client';

import { create } from 'zustand';

import type { TourId, TourStep } from '@/lib/tours';

/**
 * The running tour.
 *
 * A store rather than props for the usePlannerStore reason: the things that
 * START a tour (the "Take the tour" card in WorkspaceView, and the replay rows
 * in the HelpMenu and Settings) sit in different ownership islands from the
 * overlay, which AppShell mounts once.
 *
 * There used to be a `pendingReplay` here too, a request parked for the
 * welcome ("catalog") tour to pick up on arrival. That tour was removed on
 * 2026-10-11 (lib/tours.ts says why) and the rollout tour starts directly, so
 * nothing parks a request any more.
 */
export type ActiveTour = {
  tourId: TourId;
  stepIndex: number;
  steps: readonly TourStep[];
};

type TourState = {
  active: ActiveTour | null;
  start: (tourId: TourId, steps: readonly TourStep[]) => void;
  next: () => void;
  skip: () => void;
  finish: () => void;
};

export const useTourStore = create<TourState>((set) => ({
  active: null,
  start: (tourId, steps) => set({ active: steps.length ? { tourId, stepIndex: 0, steps } : null }),
  next: () =>
    set((state) => {
      if (!state.active) return state;
      const nextIndex = state.active.stepIndex + 1;
      if (nextIndex >= state.active.steps.length) return { ...state, active: null };
      return { ...state, active: { ...state.active, stepIndex: nextIndex } };
    }),
  skip: () => set({ active: null }),
  finish: () => set({ active: null }),
}));

/** Imperative read for callers outside React — the first-release prompt's
 *  fire-time guard runs in a timer callback, not a render. */
export function isTourRunning(): boolean {
  return useTourStore.getState().active !== null;
}

/** A running tour holds back anything that would interrupt it. */
export function tourBlocksPrompts(): boolean {
  return useTourStore.getState().active !== null;
}
