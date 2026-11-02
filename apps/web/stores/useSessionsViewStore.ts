'use client';

import { create } from 'zustand';
import { registerSignOutReset } from '@/lib/sign-out-resets';

/**
 * The Sessions tab's own state (Nov 2, 2026): which rollout's session is open
 * (null = the list of rollouts), and the brief "Back to <rollout>" pill that a
 * message typed on a rollout page leaves behind. Not in the URL: the tab's
 * address stays /dashboard/sessions, and the arrow in the session's header is
 * the way back to the list.
 */
type SessionsViewState = {
  releaseId: string | null;
  /** Where the pill goes back to, and when it was set (it fades on its own). */
  backTo: { href: string; label: string; at: number } | null;
  /** The rollout whose session chat is on screen and ready to take a message. */
  readyFor: string | null;
  setReadyFor: (releaseId: string | null) => void;
  /** True once a session pinned the assistant's rollout scope, so the
   *  Assistant tab knows to clear it again when it takes the screen. */
  pinnedScope: boolean;
  open: (releaseId: string | null) => void;
  setBackTo: (backTo: { href: string; label: string } | null) => void;
  setPinnedScope: (value: boolean) => void;
};

const OPEN_KEY = 'urganize.tab-memory.rollout-chat';

function readOpen(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(OPEN_KEY);
  } catch {
    return null;
  }
}

export const useSessionsViewStore = create<SessionsViewState>((set) => ({
  releaseId: readOpen(),
  backTo: null,
  pinnedScope: false,
  readyFor: null,
  setReadyFor: (readyFor) => set({ readyFor }),
  open: (releaseId) => {
    // The open rollout chat survives a reload of the tab (Nov 2, 2026).
    try {
      if (releaseId) window.sessionStorage.setItem(OPEN_KEY, releaseId);
      else window.sessionStorage.removeItem(OPEN_KEY);
    } catch {
      // Storage blocked: it still lasts for this page life.
    }
    set({ releaseId });
  },
  setBackTo: (backTo) => set({ backTo: backTo ? { ...backTo, at: Date.now() } : null }),
  setPinnedScope: (pinnedScope) => set({ pinnedScope }),
}));

registerSignOutReset('sessions-view', () => {
  try {
    window.sessionStorage.removeItem(OPEN_KEY);
  } catch {
    // Nothing to clear.
  }
  useSessionsViewStore.setState({ releaseId: null, backTo: null, pinnedScope: false, readyFor: null });
});

/**
 * Resolves once the rollout's session chat is on screen (or after a few
 * seconds, so a slow load never swallows a message for good). The shared chat
 * box waits on this so a message sent right after opening a session lands in
 * that session and not in the chat that was open a moment before.
 */
export function whenSessionReady(releaseId: string, timeoutMs = 6000): Promise<void> {
  if (useSessionsViewStore.getState().readyFor === releaseId) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      unsubscribe();
      window.clearTimeout(timer);
      resolve();
    };
    const unsubscribe = useSessionsViewStore.subscribe((state) => {
      if (state.readyFor === releaseId) done();
    });
    const timer = window.setTimeout(done, timeoutMs);
  });
}
