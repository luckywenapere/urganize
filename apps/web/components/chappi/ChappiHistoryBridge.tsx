'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import {
  flushChappiHistory,
  retryChappiHistory,
  startChappiHistory,
} from '@/stores/useChappiHistoryStore';

/**
 * Starts UrgAns chat history for the signed-in user. Mounted by the workspace
 * layout (WorkspaceFrame, URG-314) only while NEXT_PUBLIC_FEATURE_URGANS_HISTORY
 * is on, so signed-out routes never load the store; AppShell warms the list and
 * Home chat requests right after sign-in (lib/chappi/history-warm.ts). Renders
 * nothing. Curators never get it — they have no UrgAns.
 *
 * Starts from the PERSISTED identity instead of waiting for auth to resolve,
 * so a recent chat is restored while the UrgAns page is still showing its
 * skeleton (which does wait on auth) — never a flash of the greeting and then
 * the chat. A persisted session that turns out to be dead signs out, and the
 * sign-out branch in lib/auth-store.ts wipes whatever was restored.
 *
 * No stop on cleanup, on purpose: this never unmounts in practice, sign-out
 * resets history itself, and an account switch without a sign-out is handled
 * inside startChappiHistory.
 */
export function ChappiHistoryBridge() {
  const userId = useAuthStore((state) =>
    state.isAuthenticated && state.user && state.user.role !== 'curator' ? state.user.id : null
  );

  useEffect(() => {
    if (userId) startChappiHistory(userId);
  }, [userId]);

  useEffect(() => {
    // A phone may never bring a hidden page back, so anything waiting on the
    // save debounce goes now. pagehide covers the iOS close that skips
    // visibilitychange.
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flushChappiHistory();
    };
    const handlePageHide = () => flushChappiHistory();
    const handleOnline = () => retryChappiHistory();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return null;
}
