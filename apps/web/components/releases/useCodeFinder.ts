'use client';

// The browser half of finding a song's UPC and ISRC (Nov 2026, #1086), shared
// by the Out now card on Home and the smart link on Distribute.
//
// It asks the server on mount and then every 15 minutes while it is still
// looking (the server holds the same 15 minutes, so a second open tab cannot
// make it look more often). Answering "Yes" saves the codes and makes the link.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { LOOKUP_RETRY_MS, type CodeCandidate } from '@/lib/code-finder/rules';

export type CodeFinderClientView =
  | { status: 'has_code' }
  | { status: 'not_out' }
  | { status: 'looking' }
  | { status: 'found'; candidate: CodeCandidate }
  | { status: 'confirmed' };

async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
  });
}

export function useCodeFinder(releaseId: string, enabled: boolean, onLinkMade?: () => void) {
  const [view, setView] = useState<CodeFinderClientView | null>(null);
  const [answering, setAnswering] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);

  const look = useCallback(async () => {
    try {
      const response = await authedFetch(`/api/releases/${releaseId}/find-codes`);
      if (!response.ok) {
        // A guest, a switched-off feature or a server blip: show nothing new.
        if (live.current) setView((current) => current ?? { status: 'looking' });
        return;
      }
      const body = (await response.json()) as { view: CodeFinderClientView };
      if (live.current) setView(body.view);
    } catch {
      if (live.current) setView((current) => current ?? { status: 'looking' });
    }
  }, [releaseId]);

  useEffect(() => {
    live.current = true;
    if (!enabled) return;
    void look();
    return () => {
      live.current = false;
    };
  }, [enabled, look]);

  const stillLooking = enabled && view?.status === 'looking';
  useEffect(() => {
    if (!stillLooking) return;
    const timer = window.setInterval(() => void look(), LOOKUP_RETRY_MS);
    return () => window.clearInterval(timer);
  }, [stillLooking, look]);

  const answer = useCallback(
    async (accept: boolean) => {
      setAnswering(accept ? 'yes' : 'no');
      setError(null);
      try {
        const response = await authedFetch(`/api/releases/${releaseId}/find-codes`, {
          method: 'POST',
          body: JSON.stringify({ answer: accept ? 'yes' : 'no' }),
        });
        if (!response.ok) throw new Error('answer');
        const body = (await response.json()) as { view: CodeFinderClientView };
        if (!live.current) return;
        setView(body.view);
        if (accept) onLinkMade?.();
      } catch {
        if (live.current) setError('That didn’t save. Try again.');
      } finally {
        if (live.current) setAnswering(null);
      }
    },
    [releaseId, onLinkMade]
  );

  return { view, answering, error, answer };
}
