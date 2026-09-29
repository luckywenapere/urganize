'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Tailwind's `sm`. At and above it the settings pop-up shows its list and its
// pane side by side; below it, one at a time.
const WIDE_QUERY = '(min-width: 640px)';

/**
 * True when there is room for the two-pane layout.
 *
 * A JS answer rather than `sm:` classes because the phone and the wide layouts
 * are not the same DOM dressed differently — they mount different things (the
 * phone at its list mounts no segment at all, the wide layout always mounts
 * one), and mounting a segment is what fires its fetches. Same reason
 * `useIsDesktopViewport` exists for the workspace.
 *
 * `useSyncExternalStore` keeps the matchMedia read out of render, and the server
 * snapshot is a stable `false`: the pop-up only ever renders after a click or a
 * deep link, on the client, so no wrong answer is ever painted first.
 */
export function useIsWide(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(WIDE_QUERY);
    mql.addEventListener('change', onStoreChange);
    return () => mql.removeEventListener('change', onStoreChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false
  );
}
