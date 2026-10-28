'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { NARROW_PORTRAIT_QUERY } from './plan-view';

/** True on a phone held upright. Server snapshot is false (see useIsDesktopViewport). */
export function useNarrowPortrait(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mql = window.matchMedia(NARROW_PORTRAIT_QUERY);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return useSyncExternalStore(subscribe, () => window.matchMedia(NARROW_PORTRAIT_QUERY).matches, () => false);
}
