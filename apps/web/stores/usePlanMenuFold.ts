'use client';

import { create } from 'zustand';

/**
 * Whether an open rollout's plan menu is folded away (#898, founder approved
 * mock, Oct 30, 2026). WorkspaceView runs the gestures; the computer's page
 * (tabs, page bar tools, phase cards) and the phone header read it, so they
 * meet here, the useRolloutPhoneChrome pattern.
 */
type PlanMenuFoldState = {
  folded: boolean;
  /** How far a pull at the top has come, 0 to 1, for the pill to show. */
  pull: number;
  setFolded: (folded: boolean) => void;
  setPull: (pull: number) => void;
};

export const usePlanMenuFold = create<PlanMenuFoldState>((set) => ({
  folded: false,
  pull: 0,
  setFolded: (folded) => set({ folded, pull: 0 }),
  setPull: (pull) => set((state) => (state.pull === pull ? state : { pull })),
}));
