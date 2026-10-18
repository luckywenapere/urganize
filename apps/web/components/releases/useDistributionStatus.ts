'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { DistributionPayload } from '@/lib/distribution-server';

/** Bearer headers for the distribution routes, or null when the session is gone. */
export async function distributionAuthHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

/**
 * The check before distribution for one rollout, read from the server.
 *
 * ONE READER FOR TWO PLACES: the Distribute scene and the status on the rollout
 * both show the same list, so both read it here and neither can show a different
 * answer. It is never cached: the point of the status is that fixing something
 * and coming back shows the fix, and a stale "all clear" is exactly the failure
 * this feature exists to prevent.
 *
 * `setData` is exposed because a refused order (409) comes back carrying the
 * current list, which is fresher than whatever was loaded.
 */
/**
 * The last answer per rollout, this session only (memory, never storage), for
 * the phone's "Ready to distribute" row alone (`seed: true`). Without it the row
 * arrived a beat after every return to the rollout (closing a scene, the iPhone
 * Back swipe) and pushed the timeline down under the person's thumb (Oct 18,
 * 2026). The rule above still holds: an answer with nothing open is never
 * seeded, so a stale "all clear" cannot show, and the seeded answer is replaced
 * by a fresh read straight away.
 */
const lastOpenAnswer = new Map<string, DistributionPayload>();

function hasOpenItems(payload: DistributionPayload | null | undefined): payload is DistributionPayload {
  return Boolean(payload && payload.errors.length + payload.warnings.length > 0);
}

/** For tests. */
export function seededDistributionAnswer(releaseId: string): DistributionPayload | null {
  return lastOpenAnswer.get(releaseId) ?? null;
}

export function useDistributionStatus(releaseId: string, options: { seed?: boolean } = {}) {
  const seed = options.seed === true;
  const [data, setDataState] = useState<DistributionPayload | null>(() =>
    seed ? (lastOpenAnswer.get(releaseId) ?? null) : null
  );
  // Whether the first answer on screen came from the seed (callers that animate
  // an arrival skip it then: the block was already there).
  const [seeded] = useState(() => seed && lastOpenAnswer.has(releaseId));
  const setData = useCallback(
    (next: SetStateAction<DistributionPayload | null>) => {
      setDataState((current) => {
        const value = typeof next === 'function' ? next(current) : next;
        if (hasOpenItems(value)) lastOpenAnswer.set(releaseId, value);
        else lastOpenAnswer.delete(releaseId);
        return value;
      });
    },
    [releaseId]
  );
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const headers = await distributionAuthHeaders();
      if (!headers) {
        setLoadError('Your session expired. Sign in again.');
        return;
      }
      const response = await fetch(`/api/releases/${releaseId}/distribution`, { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoadError(String(body?.error || 'Could not load this step.'));
        return;
      }
      setData(body.distribution as DistributionPayload);
    } catch {
      setLoadError('Could not reach the server. Check your connection and try again.');
    }
  }, [releaseId, setData]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, setData, loadError, reload: load, seeded };
}
