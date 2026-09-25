'use client';

import { useCallback, useSyncExternalStore } from 'react';

import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import {
  PLAN_BUILT_SEEN_STORAGE_KEY,
  PLAN_BUILT_SEEN_STORAGE_VERSION,
  hasSeenPlanBuilt,
  isSeenList,
  markSeenPlanBuilt,
} from '@/lib/plan-built-seen';

/**
 * Has this manager dismissed the summary of the plan UrgAns built for a
 * release? Read through useSyncExternalStore rather than a mount effect, so
 * it costs no setState-in-effect and the server render (which cannot see
 * localStorage) answers "seen" — nothing flashes and then vanishes.
 *
 * The same-tab notify is the part a plain `storage` listener misses: that
 * event only fires in OTHER tabs, so markPlanBuiltSeen also pings every
 * subscriber here.
 */

const listeners = new Set<() => void>();

function readSeenList(): unknown {
  return readPersistedState(PLAN_BUILT_SEEN_STORAGE_KEY, PLAN_BUILT_SEEN_STORAGE_VERSION, isSeenList);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === PLAN_BUILT_SEEN_STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function markPlanBuiltSeen(releaseId: string): void {
  try {
    writePersistedState(
      PLAN_BUILT_SEEN_STORAGE_KEY,
      PLAN_BUILT_SEEN_STORAGE_VERSION,
      markSeenPlanBuilt(readSeenList(), releaseId)
    );
  } catch {
    // writePersistedState does not guard setItem (Safari private mode, a full
    // quota). A dismissal that could not be written still has to close the
    // banner for this session, which the notify below does.
  }
  for (const listener of listeners) listener();
}

export function usePlanBuiltSeen(releaseId: string | null): boolean {
  const getSnapshot = useCallback(
    () => (releaseId ? hasSeenPlanBuilt(readSeenList(), releaseId) : true),
    [releaseId]
  );
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
