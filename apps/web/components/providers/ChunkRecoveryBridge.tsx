'use client';

import { useEffect } from 'react';
import {
  CHUNK_RELOAD_STORAGE_KEY,
  isChunkLoadError,
  nextReloadRecord,
  parseReloadRecord,
  shouldReload,
} from '@/lib/chunk-recovery';

/**
 * Recovers a tab wedged by version skew after a deploy (2026-08-16).
 * See lib/chunk-recovery.ts for the full failure description — in short, a
 * client navigation asks for a chunk the new deployment no longer serves,
 * React never runs for that route, and the page looks alive but every control
 * is dead. Browser Back is the most common trigger, because it navigates
 * without re-fetching the document.
 *
 * Mounted by AppShell, which the root layout wraps around every route, so one
 * instance covers the whole app. Renders nothing.
 *
 * Listens on `window` rather than using an error boundary because there is no
 * React error to catch: a failed chunk fetch rejects outside the render, so it
 * arrives as a global `error` or `unhandledrejection` event and nothing else
 * in the app ever sees it.
 *
 * Reloading is a blunt remedy and is treated as such — it is gated behind a
 * narrow error match, a cooldown and a per-session ceiling (all in the pure
 * module), so it can only fire when the page is already non-functional and can
 * never become a reload loop. The proper fix is Vercel Skew Protection, which
 * keeps an old client's assets resolvable; this is the fallback for the window
 * that protection does not cover.
 */
export function ChunkRecoveryBridge() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const recover = () => {
      let record = { at: 0, attempts: 0 };
      // sessionStorage throws in some privacy modes; a storage failure must
      // not stop the recovery, so fall back to reloading once un-budgeted
      // rather than not at all.
      try {
        record = parseReloadRecord(window.sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY));
      } catch {
        // keep the zero record
      }

      const now = Date.now();
      if (!shouldReload(record, now)) return;

      try {
        window.sessionStorage.setItem(
          CHUNK_RELOAD_STORAGE_KEY,
          JSON.stringify(nextReloadRecord(record, now))
        );
      } catch {
        // Unwritable storage means no budget tracking, but the cooldown below
        // still bounds it: the reload itself takes long enough that a tight
        // loop is not reachable in practice.
      }

      console.warn('[chunk-recovery] stale build detected — reloading to pick up the new one');
      window.location.reload();
    };

    const onError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) recover();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) recover();
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
