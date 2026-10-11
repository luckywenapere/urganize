'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { isShareRewardEnabled, shareRewardConfirmation } from '@/lib/share-reward';

/**
 * The share sheet's side of the share reward (lib/share-reward.ts).
 *
 * Asks the server once per open whether this person sees the offer, and claims
 * it on the first share tap. `claim` is safe to call from every button on every
 * tap: it does something only while the offer is showing, and only once.
 *
 * Everything fails quiet. A failed check shows no offer; a failed claim puts
 * the offer back so the next tap tries again. The share itself never waits on
 * any of this, because Web Share only opens inside the tap's own gesture.
 */

export type ShareRewardState =
  | { status: 'hidden' }
  | { status: 'offer' }
  | { status: 'claiming' }
  | { status: 'claimed'; message: string };

async function getAccessToken(): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || '';
  } catch {
    return '';
  }
}

export function useShareReward(): { state: ShareRewardState; claim: () => void } {
  const [state, setStateValue] = useState<ShareRewardState>({ status: 'hidden' });
  // The ref is what `claim` reads, so a second tap in the same tick sees the
  // first one's 'claiming'. Written only through setState, never during render.
  const stateRef = useRef<ShareRewardState>({ status: 'hidden' });
  const setState = useCallback((next: ShareRewardState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);

  useEffect(() => {
    if (!isShareRewardEnabled()) return;
    let active = true;
    void (async () => {
      const token = await getAccessToken();
      if (!token) return;
      try {
        const response = await fetch('/api/workspace/share-reward', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { eligible?: unknown };
        if (active && payload.eligible === true) setState({ status: 'offer' });
      } catch {
        // No offer. The sheet works exactly as before.
      }
    })();
    return () => {
      active = false;
    };
  }, [setState]);

  const claim = useCallback(() => {
    if (stateRef.current.status !== 'offer') return;
    setState({ status: 'claiming' });
    void (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('No session');
        const response = await fetch('/api/workspace/share-reward', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: '{}',
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as {
          claimed?: unknown;
          accessUntil?: unknown;
          reason?: unknown;
        };
        if (payload.claimed === true) {
          setState({
            status: 'claimed',
            message: shareRewardConfirmation(
              typeof payload.accessUntil === 'string' ? payload.accessUntil : null
            ),
          });
          return;
        }
        if (response.ok || response.status === 403) {
          // Already claimed (another tap, another phone), or not this person's
          // to claim: the offer goes away rather than promising again.
          setState({ status: 'hidden' });
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      } catch {
        // Put the offer back, so the next tap tries again.
        setState({ status: 'offer' });
      }
    })();
  }, [setState]);

  return { state, claim };
}
