'use client';

// A bridge, not a page (founder, 2026-10-15): "remove pitching from the top
// menu and let it just be fully inside each rollout". Everything this page
// used to hold (the composer, answers, editorial pitches, payments, the
// curator inbox link) now lives in each rollout's Pitch tab (PitchScene).
//
// The route stays because links into it are already out in the world: curator
// public pages (?curator=), Paystack's cancel link (?payment=cancelled),
// notification emails and Home's "See pitches". It forwards them to a
// rollout's Pitch tab, carrying those params. With no rollout yet it shows its
// own "Plan a rollout" empty state (2026-10-24; it used to send people to the
// catalogue, behind the old first-rollout lock).
//
// NEVER useSearchParams (the static-page trap recorded for /auth and
// MobileNavBar): the params are read imperatively, once.

import { useEffect, useState } from 'react';
import { Send } from '@/components/icons';
import { NeedsRolloutEmpty } from '@/components/releases/NeedsRolloutEmpty';
import { useRouter } from 'next/navigation';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { CATALOGUE_HREF } from '@/lib/shell-nav';
import { rolloutPitchPath } from '@/lib/pitching';
import { pendingCreditSendReleaseId } from '@/lib/pitch-credits-client';

const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

export default function PitchingPageClient() {
  const router = useRouter();
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const [noRollout, setNoRollout] = useState(false);

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
      // ?artist= (Oct 17, 2026): the directory profile's "Edit it in Pitch
      // this!" lands on a rollout of that artist, where the bio is edited.
      const artist = params.get('artist') || '';
      const forArtist = artist ? releases.find((release) => release.artistId === artist)?.id : undefined;
      // A credits top-up from Pitch this! (URG-345) returns here with no
      // ?release=; the rollout it was for is remembered with the waiting send.
      const pending = pendingCreditSendReleaseId();
      const releaseId = releases.some((release) => release.id === asked)
        ? asked
        : releases.some((release) => release.id === pending)
          ? pending
          : forArtist || releases[0]?.id || '';
      if (!releaseId) {
        // A failed load is not "no rollouts": keep the old way out for it.
        if (useReleaseStore.getState().error) router.replace(CATALOGUE_HREF);
        else setNoRollout(true);
        return;
      }
      router.replace(
        rolloutPitchPath(releaseId, {
          curator: params.get('curator') || undefined,
          payment: params.get('payment') || undefined,
          reference: params.get('reference') || params.get('trxref') || undefined,
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCommandCenter, router]);

  if (noRollout) {
    return (
      <div className="mx-auto w-full max-w-3xl pt-5 sm:pt-6">
        <NeedsRolloutEmpty
          icon={<Send className="h-6 w-6" aria-hidden />}
          title="Pitching needs a rollout"
          body="Songs are pitched from a rollout. Plan one and pitch it from there."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3" aria-busy="true">
      <div className="h-11 w-48 animate-pulse rounded-xl bg-bg-surface" />
      <div className="h-40 animate-pulse rounded-2xl bg-bg-surface" />
    </div>
  );
}
