'use client';

import { create } from 'zustand';

/**
 * The phone rollout view's header state (rollout declutter, founder approved
 * Oct 18, 2026). The header lives in WorkspaceView, but what its two icons
 * open lives elsewhere: search and the colour key in TimelineScene, the
 * Rollout menu sheet in TasksPanel, and the section tabs it hides in SubNav.
 * Drilling props to all three would touch the shell, so they meet here, the
 * useShareStore pattern.
 *
 * Phone only. Every reader is below `lg`.
 */
type RolloutPhoneChromeState = {
  /** A rollout is open in the phone drill-down: SubNav draws nothing. */
  rolloutOpen: boolean;
  /** The header's search icon was tapped: search, Filter and the key show. */
  searchOpen: boolean;
  /** The header's menu icon was tapped: the Rollout menu sheet is up. */
  menuOpen: boolean;
  setRolloutOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setMenuOpen: (open: boolean) => void;
};

export const useRolloutPhoneChrome = create<RolloutPhoneChromeState>((set) => ({
  rolloutOpen: false,
  searchOpen: false,
  menuOpen: false,
  setRolloutOpen: (rolloutOpen) =>
    set(rolloutOpen ? { rolloutOpen } : { rolloutOpen, searchOpen: false, menuOpen: false }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
}));
