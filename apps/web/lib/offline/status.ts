'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Online/offline status via the browser's own signal.
 *
 * `navigator.onLine` is a HINT, not authority: it goes false reliably when
 * the OS reports no network interface at all, but it can stay true on a
 * connected-but-broken network (captive portal, DNS down, a flaky proxy).
 * `offline` should therefore be treated as definite ("show the banner, stop
 * firing doomed requests"); `online` should be treated as probable ("try
 * again") — callers that actually move data still trust a real fetch
 * failure over this value, never the other way around. See
 * lib/offline/network-error.ts for the classifier that does that.
 *
 * useSyncExternalStore rather than a state+effect pair, the
 * useIsDesktopViewport precedent: the subscription and the read both stay
 * outside render, and the SSR/initial snapshot is a stable `true` — "assume
 * online until proven otherwise" is the correct default for a page that
 * hasn't hydrated yet.
 */
export function useOnlineStatus(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener('online', onStoreChange);
    window.addEventListener('offline', onStoreChange);
    return () => {
      window.removeEventListener('online', onStoreChange);
      window.removeEventListener('offline', onStoreChange);
    };
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    () => true
  );
}

/** Non-hook read for call sites outside a component (store actions, plain
 * functions) that want a quick "don't even try" check before firing a
 * request. Same "hint, not authority" caveat as the hook above. */
export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}
