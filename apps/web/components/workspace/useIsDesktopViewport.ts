'use client';

import { useCallback, useSyncExternalStore } from 'react';

const DESKTOP_QUERY = '(min-width: 1024px)';

/**
 * True at Tailwind's `lg` breakpoint and up. WorkspaceView renders its mobile
 * and desktop branches SIMULTANEOUSLY (CSS `lg:hidden` / `hidden lg:block`
 * decides which is visible), which is fine for cheap presentational trees but
 * meant anything passed to both branches MOUNTED TWICE — the calendar scene
 * double-fetched its calendars and posts and raced two copies of its
 * month-param sync on every open (2026-08-10 fix). This hook lets the view
 * hand side-effectful children to exactly one branch.
 *
 * useSyncExternalStore rather than a state+effect pair: the matchMedia read
 * stays out of render (lint purity), and the server snapshot is a stable
 * `false` — safe because WorkspaceView returns its skeleton during SSR and
 * initial load, so no scene content renders before the client value is live.
 */
export function useIsDesktopViewport(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    mql.addEventListener('change', onStoreChange);
    return () => mql.removeEventListener('change', onStoreChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false
  );
}
