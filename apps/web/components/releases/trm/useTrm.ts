'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrmPayload } from '@/lib/trm/server';
import { distributionAuthHeaders } from '../useDistributionStatus';

export type TrmPost = (
  action: string,
  body?: Record<string, unknown>
) => Promise<{ ok: boolean; status: number; data: Record<string, unknown> }>;

/** The Send to TRM payload for one rollout, plus a POST helper. Not cached:
 *  coming back after a fix shows the fix. */
export function useTrm(releaseId: string) {
  const [data, setData] = useState<TrmPayload | null>(null);
  const [loadError, setLoadError] = useState('');
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const headers = await distributionAuthHeaders();
      if (!headers) return;
      const response = await fetch(`/api/releases/${releaseId}/trm`, { headers, cache: 'no-store' });
      const body = (await response.json().catch(() => ({}))) as { trm?: TrmPayload; error?: string };
      if (!alive.current) return;
      if (!response.ok || !body.trm) {
        setLoadError(body.error || 'We could not load this step.');
        return;
      }
      setLoadError('');
      setData(body.trm);
    } catch {
      if (alive.current) setLoadError('We could not load this step.');
    }
  }, [releaseId]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  const post: TrmPost = useCallback(
    async (action, body = {}) => {
      const headers = await distributionAuthHeaders();
      if (!headers) return { ok: false, status: 401, data: { error: 'Sign in again.' } };
      try {
        const response = await fetch(`/api/releases/${releaseId}/trm`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, ...body }),
        });
        const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        return { ok: response.ok, status: response.status, data: json };
      } catch {
        return { ok: false, status: 0, data: { error: 'No connection. Try again.' } };
      }
    },
    [releaseId]
  );

  return { data, loadError, reload, post };
}
