'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

const PITCH_KIT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCH_KIT === 'true';

/**
 * The story written for a rollout's pitch kit, for the playlist pitch note.
 *
 * Returns '' whenever there is nothing to offer: the pitch kit is switched
 * off, the rollout has no story, the read failed, or it is still loading. The
 * composer treats all of those the same (it shows no button), so a failure
 * here can never get between a manager and sending a pitch.
 *
 * The answer is keyed on the rollout it was fetched for, so switching to
 * another rollout never briefly offers the previous one's story.
 */
export function usePitchKitStory(releaseId: string): string {
  const [loaded, setLoaded] = useState<{ releaseId: string; story: string } | null>(null);

  useEffect(() => {
    if (!PITCH_KIT_ENABLED || !releaseId) return;
    let cancelled = false;
    void (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || '';
        if (!token) return;
        const response = await fetch(`/api/releases/${releaseId}/pitch-kit`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const body = (await response.json().catch(() => null)) as {
          pitchKit?: { fields?: { story?: unknown } };
        } | null;
        const story = body?.pitchKit?.fields?.story;
        if (!cancelled && typeof story === 'string') setLoaded({ releaseId, story: story.trim() });
      } catch {
        // Offer nothing. The note is still the manager's to type.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  return loaded && loaded.releaseId === releaseId ? loaded.story : '';
}
