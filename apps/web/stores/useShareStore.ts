'use client';

import { create } from 'zustand';

import type { ShareReleaseFacts } from '@/lib/social-share';

/**
 * The share sheet's launcher (share to socials, 2026-09-23).
 *
 * The sheet can be opened from four places in different ownership islands: the
 * three create-rollout flows (the workspace, the UrgAns page, the topbar's
 * modal), the rollout's own Share button, UrgAns in the conversation, and the
 * onboarding hand-off. Drilling a callback to all of them would touch a file
 * per entry point, so the sheet is mounted ONCE in AppShell and opened through
 * this store, the usePlannerStore pattern.
 */

export type ShareSource = 'first_release' | 'rollout_menu' | 'urgans';

export type ShareRequest = {
  /** New for every open, so the sheet's own state resets between opens. */
  token: number;
  releaseId: string;
  source: ShareSource;
  /**
   * What the caller already knows about the rollout. A create flow opens the
   * sheet before the catalog has resynced, so the store may not hold the new
   * rollout yet, and the questions should not wait on a network round trip to
   * say its name.
   */
  snapshot?: Partial<ShareReleaseFacts>;
  /**
   * What happens after the sheet closes. The create flows pass the rest of
   * their own sequence here (the planner intake, the new-rollout guide), so
   * the sheet slots into that sequence rather than stacking on top of it.
   */
  then?: () => void;
};

type ShareStore = {
  request: ShareRequest | null;
  /** How many sheets are mounted. Zero means nobody would see an open. */
  mounted: number;
  /**
   * Show the sheet. Answers whether a sheet actually took the request: false
   * means none is mounted, and the caller's `then` has already run.
   */
  open: (request: Omit<ShareRequest, 'token'>) => boolean;
  close: () => void;
  /** The sheet's mount effect; returns its own cleanup. */
  registerSheet: () => () => void;
};

let nextToken = 1;

export const useShareStore = create<ShareStore>((set, get) => ({
  request: null,
  mounted: 0,

  open: (request) => {
    // No sheet on screen to receive this (a page outside the app chrome, or
    // the flag off where the sheet renders nothing). Carrying on is the only
    // safe answer: a create flow that handed us its `then` must never stall
    // waiting for a sheet that will not appear.
    if (get().mounted === 0) {
      request.then?.();
      return false;
    }
    // A second open while one is showing: finish the first sequence before
    // replacing it, so no caller's continuation is silently dropped.
    const previous = get().request;
    set({ request: { ...request, token: nextToken++ } });
    previous?.then?.();
    return true;
  },

  close: () => {
    const previous = get().request;
    set({ request: null });
    // After the state change, so whatever runs next (the planner intake, a
    // navigation) never sees the sheet as still open.
    previous?.then?.();
  },

  registerSheet: () => {
    set((state) => ({ mounted: state.mounted + 1 }));
    return () => set((state) => ({ mounted: Math.max(0, state.mounted - 1) }));
  },
}));
