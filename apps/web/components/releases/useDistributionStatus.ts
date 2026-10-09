'use client';

import { useCallback, useEffect, useState } from 'react';
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
export function useDistributionStatus(releaseId: string) {
  const [data, setData] = useState<DistributionPayload | null>(null);
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
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, setData, loadError, reload: load };
}
