'use client';

import { useCallback, useEffect, useState } from 'react';
import type { HandoffItemKey, HandoffLeadDays, HandoffPayload } from '@/lib/handoff';
import { distributionAuthHeaders } from './useDistributionStatus';

export type HandoffChange =
  | { action: 'approve' | 'send' | 'unsend'; item: HandoffItemKey }
  | { action: 'owner'; item: HandoffItemKey; ownerUserId: string }
  | { action: 'lead'; leadDays: HandoffLeadDays };

/**
 * The handoff to the distributor for one rollout, read from the server (URG-322).
 * Never cached, like the check before distribution: uploading the artwork and
 * coming back has to show Uploaded, and a stale row is the failure this exists
 * to prevent. The Distribute step and the rollout line both read it here.
 */
export function useHandoff(releaseId: string) {
  const [data, setData] = useState<HandoffPayload | null>(null);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const headers = await distributionAuthHeaders();
      if (!headers) {
        setLoadError('Your session expired. Sign in again.');
        return;
      }
      const response = await fetch(`/api/releases/${releaseId}/handoff`, { headers });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.handoff) {
        setLoadError(String(body?.error || 'Couldn’t load the handoff.'));
        return;
      }
      setData(body.handoff as HandoffPayload);
    } catch {
      setLoadError('Check your connection.');
    }
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One change. Answers null on success or the sentence to show. */
  const change = useCallback(
    async (next: HandoffChange): Promise<string | null> => {
      setIsSaving(true);
      try {
        const headers = await distributionAuthHeaders();
        if (!headers) return 'Your session expired. Sign in again.';
        const response = await fetch(`/api/releases/${releaseId}/handoff`, {
          method: 'POST',
          headers,
          body: JSON.stringify(next),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.handoff) return String(body?.error || 'Couldn’t save that. Try again.');
        setData(body.handoff as HandoffPayload);
        return null;
      } catch {
        return 'Couldn’t reach the server. Check your connection.';
      } finally {
        setIsSaving(false);
      }
    },
    [releaseId]
  );

  return { data, loadError, reload: load, change, isSaving };
}
