'use client';

// A bridge, not a page (founder, 2026-10-15): "remove pitching from the top
// menu and let it just be fully inside each rollout". Everything this page
// used to hold (the composer, answers, editorial pitches, payments, the
// curator inbox link) now lives in each rollout's Pitch tab (PitchScene).
//
// The route stays because links into it are already out in the world: curator
// public pages (?curator=), Paystack's cancel link (?payment=cancelled),
// notification emails and Home's "See pitches". It forwards them to a
// rollout's Pitch tab, carrying those params, and to the catalogue when the
// team has no rollout yet.
//
// NEVER useSearchParams (the static-page trap recorded for /auth and
// MobileNavBar): the params are read imperatively, once.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { CATALOGUE_HREF } from '@/lib/shell-nav';
import { rolloutPitchPath } from '@/lib/pitching';

const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

export default function PitchingPageClient() {
  const router = useRouter();
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!PITCHING_ENABLED) {
        router.replace(CATALOGUE_HREF);
        return;
      }
      let params = new URLSearchParams();
      try {
        params = new URLSearchParams(window.location.search);
      } catch {
        // No params to carry.
      }
      await loadCommandCenter().catch(() => null);
      if (cancelled) return;
      const releases = useReleaseStore.getState().releases;
      const asked = params.get('release') || '';
      const releaseId = releases.some((release) => release.id === asked) ? asked : releases[0]?.id || '';
      if (!releaseId) {
        router.replace(CATALOGUE_HREF);
        return;
      }
      router.replace(
        rolloutPitchPath(releaseId, {
          curator: params.get('curator') || undefined,
          payment: params.get('payment') || undefined,
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCommandCenter, router]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3" aria-busy="true">
      <div className="h-11 w-48 animate-pulse rounded-xl bg-bg-surface" />
      <div className="h-40 animate-pulse rounded-2xl bg-bg-surface" />
    </div>
  );
}
