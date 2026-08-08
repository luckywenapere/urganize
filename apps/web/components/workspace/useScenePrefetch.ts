'use client';

import { useEffect } from 'react';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { runWhenIdle } from '@/lib/connection';

/**
 * Warm a scoped release's four scenes during idle time.
 *
 * The premise: scoping a release means the user is now reading its activity
 * list, which is several seconds of them looking at the screen and the network
 * doing nothing. Spending that gap on the panels they're most likely to open
 * next turns the scene pills from "tap and wait" into "tap and it's there".
 *
 * Bounded three ways so this stays a good trade on a metered mobile link:
 * it waits for idle, it runs the four fetches sequentially rather than
 * competing with foreground traffic, and it doesn't run at all on Data Saver
 * or a 2g connection (see lib/connection.ts).
 */
export function useScenePrefetch(releaseId: string | null, ready: boolean): void {
  const prefetchRelease = useSceneDataStore((state) => state.prefetchRelease);

  useEffect(() => {
    if (!ready || !releaseId) return;
    const cancel = runWhenIdle(() => {
      void prefetchRelease(releaseId);
    });
    return cancel;
  }, [prefetchRelease, ready, releaseId]);
}
