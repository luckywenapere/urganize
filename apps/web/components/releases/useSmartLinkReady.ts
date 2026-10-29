'use client';

// Whether a rollout has a smart link or could have one (a UPC or ISRC and a
// release date), for the rollout menu row and the panel title (#852). Reads the
// same `GET /api/distribute/summary` the Distribute page uses, one request per
// rollout shared by every caller on the page. The Smart link view calls
// `markSmartLinkReady` when it sees a link, so the row turns at once.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { isAltlinkEnabled } from '@/lib/altlink/rules';
import type { DistributeRow } from '@/lib/distribute-summary';

const EVENT = 'urganize:smart-link-ready';
const known = new Map<string, boolean>();
const pending = new Map<string, Promise<boolean>>();

async function fetchReady(releaseId: string): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const response = await fetch(`/api/distribute/summary?ids=${encodeURIComponent(releaseId)}`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { rows?: Record<string, DistributeRow> };
    return Boolean(body.rows?.[releaseId]?.link);
  } catch {
    return false;
  }
}

/** The Smart link view saw a link: every row and title for it turns now. */
export function markSmartLinkReady(releaseId: string) {
  if (known.get(releaseId)) return;
  known.set(releaseId, true);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT, { detail: releaseId }));
}

/** True / false once known, null while loading or with no rollout. */
export function useSmartLinkReady(releaseId: string | null): boolean | null {
  const [ready, setReady] = useState<boolean | null>(() => (releaseId ? known.get(releaseId) ?? null : null));

  useEffect(() => {
    if (!releaseId || !isAltlinkEnabled()) return;
    let cancelled = false;
    const cached = known.get(releaseId);
    if (cached !== undefined) {
      setReady(cached);
    } else {
      let request = pending.get(releaseId);
      if (!request) {
        request = fetchReady(releaseId).finally(() => pending.delete(releaseId));
        pending.set(releaseId, request);
      }
      void request.then((value) => {
        if (!known.get(releaseId)) known.set(releaseId, value);
        if (!cancelled) setReady(known.get(releaseId) ?? value);
      });
    }
    const onReady = (event: Event) => {
      if ((event as CustomEvent<string>).detail === releaseId && !cancelled) setReady(true);
    };
    window.addEventListener(EVENT, onReady);
    return () => {
      cancelled = true;
      window.removeEventListener(EVENT, onReady);
    };
  }, [releaseId]);

  return releaseId ? ready : null;
}
