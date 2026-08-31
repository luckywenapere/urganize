'use client';

import { useEffect, useRef } from 'react';
import {
  CHUNK_RELOAD_STORAGE_KEY,
  isChunkLoadError,
  isInAppNavigationClick,
  nextReloadRecord,
  parseReloadRecord,
  resolveRecoveryTarget,
  shouldReload,
  type NavigationIntent,
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
 *
 * It also RESUMES the navigation rather than reloading the page being left
 * (2026-08-31). The failure is a navigation, so if the router had not yet
 * committed the new URL, a plain reload silently ate the user's click — they
 * tapped a link and got a refresh, still standing where they started. So the
 * last in-app link click is recorded here and resolveRecoveryTarget decides
 * where the recovery lands, falling back to the old plain reload for every
 * uncertainty.
 */
export function ChunkRecoveryBridge() {
  // The last in-app link the user clicked. A recovery uses it to RESUME the
  // navigation that died rather than reloading the page they were leaving —
  // see resolveRecoveryTarget, which falls back to a plain reload whenever the
  // intent is stale, cross-origin or already the current page. A ref, not
  // state: nothing renders from it, and a re-render must not clear it.
  const intentRef = useRef<NavigationIntent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // CAPTURE phase, deliberately: Next's Link calls preventDefault() to route
    // client-side, so by the bubble phase every real in-app click already
    // looks cancelled — which is exactly the set we need to record.
    const onClick = (event: MouseEvent) => {
      const eventTarget = event.target;
      const anchor = eventTarget instanceof Element ? eventTarget.closest('a') : null;
      // instanceof rather than a truthiness check: closest('a') also matches an
      // SVG <a>, whose `href` is an SVGAnimatedString rather than a string.
      if (!(anchor instanceof HTMLAnchorElement)) return;
      // getAttribute, not .href — an <a> with no href resolves .href to the
      // current page, which would record a bogus intent for a button-ish link.
      if (!anchor.getAttribute('href')) return;

      const click = {
        href: anchor.href,
        target: anchor.getAttribute('target'),
        hasDownload: anchor.hasAttribute('download'),
        modified:
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0,
      };
      if (!isInAppNavigationClick(click, window.location.href)) return;

      intentRef.current = { href: click.href, at: Date.now() };
    };

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

      // Resume the navigation when we know what it was; otherwise reload where
      // we stand, which is what this did before and is still correct whenever
      // the failure was not a link click (a lazy component on this page, or a
      // programmatic router.push we cannot observe).
      const target = resolveRecoveryTarget(window.location.href, intentRef.current, now);
      if (target) {
        console.warn('[chunk-recovery] stale build detected — resuming navigation to', target);
        window.location.assign(target);
        return;
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

    document.addEventListener('click', onClick, true);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
