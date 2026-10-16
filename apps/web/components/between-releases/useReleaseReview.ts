'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { ReleaseReviewView, ReviewAnswers } from '@/lib/release-review';

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' };
}

export type ReleaseReviewState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'none' }
  | { status: 'ready'; review: ReleaseReviewView };

/** Reads, answers and dismisses one rollout's post-release review (URG-253). */
export function useReleaseReview(releaseId: string | null) {
  const [state, setState] = useState<ReleaseReviewState>({ status: 'loading' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    if (!releaseId) return;
    setState({ status: 'loading' });
    try {
      const response = await fetch(`/api/releases/${releaseId}/review`, { headers: await authHeaders() });
      if (!response.ok) throw new Error('load failed');
      const payload = (await response.json()) as { review: ReleaseReviewView | null };
      setState(payload.review ? { status: 'ready', review: payload.review } : { status: 'none' });
    } catch {
      setState({ status: 'error' });
    }
  }, [releaseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = useCallback(
    async (method: 'POST' | 'PATCH', body: unknown) => {
      if (!releaseId) return false;
      setSaving(true);
      setSaveError('');
      try {
        const response = await fetch(`/api/releases/${releaseId}/review`, {
          method,
          headers: await authHeaders(),
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => ({}))) as { review?: ReleaseReviewView; error?: string };
        if (!response.ok || !payload.review) throw new Error(payload.error || 'Could not save. Try again.');
        setState({ status: 'ready', review: payload.review });
        return true;
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : 'Could not save. Try again.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [releaseId]
  );

  const saveAnswers = useCallback((answers: ReviewAnswers) => send('POST', { answers }), [send]);
  const setDismissed = useCallback((dismissed: boolean) => send('PATCH', { dismissed }), [send]);

  return { state, reload: load, saveAnswers, setDismissed, saving, saveError };
}
