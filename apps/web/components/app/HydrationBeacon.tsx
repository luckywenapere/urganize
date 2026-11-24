'use client';

import { useEffect } from 'react';
import { COLD_LOAD_BAR_ID, HYDRATED_ATTRIBUTE } from '@/lib/cold-load';

/**
 * Tells the cold-load watchdog (lib/cold-load.ts) that React is running.
 *
 * The watchdog is an inline script that shows "Taking long? Retry" when a
 * front-door page has not hydrated after 10 seconds. This is the other half:
 * the first effect that runs marks <html>, and takes the bar down if it was
 * already showing, so a slow but successful load clears itself. Renders
 * nothing.
 */
export function HydrationBeacon() {
  useEffect(() => {
    document.documentElement.setAttribute(HYDRATED_ATTRIBUTE, '1');
    document.getElementById(COLD_LOAD_BAR_ID)?.remove();
  }, []);
  return null;
}
