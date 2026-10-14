'use client';

// The team side of playlist pitching for ONE release, rendered inline in the
// workspace's activity slot like every other release scene.
//
// Two halves: what has been sent for this release (with each curator's answer)
// and a composer for sending the next one.
//
// Since 2026-09-09 both halves are shared components — SentPitchRow and
// PitchComposer — because /dashboard/pitching renders the same things across
// every release. This file is the release-scoped shell over them: it owns the
// scene cache read and the per-release waiting count, and nothing else. The
// behaviour is deliberately unchanged from before the extraction.
//
// 2026-10-15 (founder): Pitching left the top menu and lives fully inside
// each rollout, so this scene now carries everything the app-wide page had:
// the curator inbox link for dual accounts, the ?curator= deep link from a
// curator's public page, the cancelled-payment notice, this rollout's
// editorial pitch (Spotify and Apple Music), and its pitch payment receipts.
// /dashboard/pitching survives only as a bridge into a rollout's Pitch tab,
// so old emails, notifications and Paystack's cancel link still land.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Release } from '@/types/releases';
import type { SentPitch } from '@/types/pitching';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { MAX_WAITING_PITCHES_PER_RELEASE, countWaitingPitches } from '@/lib/pitching';
import { CuratorCardListSkeleton } from '@/components/loading/CuratorSkeleton';
import { PitchComposer } from './PitchComposer';
import { SentPitchRow } from './SentPitchRow';
import { EditorialPitchSection } from './EditorialPitchSection';
import { PitchPayments } from './PitchPayments';
import { useAuthStore } from '@/lib/auth-store';
import { isValidCuratorSlug } from '@/lib/curator-public';
import { isPitchPaymentsEnabled } from '@/lib/pitch-payments';
import { PAYMENT_FAILED } from '@/lib/pitch-payment-copy';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';

/** ?curator= (from a curator's public page) and ?payment=cancelled (Paystack's
 *  cancel link), read once and imperatively: the workspace owns the URL, and a
 *  hook here would only re-read what never changes while the scene is open. */
function readSceneParams(): { curatorSlug: string; paymentCancelled: boolean } {
  try {
    const params = new URLSearchParams(window.location.search);
    const slug = (params.get('curator') || '').trim().toLowerCase();
    return {
      curatorSlug: isValidCuratorSlug(slug) ? slug : '',
      paymentCancelled: params.get('payment') === 'cancelled',
    };
  } catch {
    return { curatorSlug: '', paymentCancelled: false };
  }
}

type PitchSceneProps = {
  release: Pick<Release, 'id' | 'title' | 'artistName'>;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

export function PitchScene({ release, onToast }: PitchSceneProps) {
  const loadScene = useSceneDataStore((state) => state.loadScene);
  const getScene = useSceneDataStore((state) => state.getScene);
  const cached = getScene(release.id, 'pitch');

  const [pitches, setPitches] = useState<SentPitch[]>(cached?.pitches || []);
  const [isLoadingPitches, setIsLoadingPitches] = useState(!cached);
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
  const paymentsOn = isPitchPaymentsEnabled();
  const [curatorSlug, setCuratorSlug] = useState('');
  const [paymentCancelled, setPaymentCancelled] = useState(false);
  useIsomorphicLayoutEffect(() => {
    const params = readSceneParams();
    setCuratorSlug(params.curatorSlug);
    setPaymentCancelled(params.paymentCancelled);
  }, []);

  const refreshPitches = useCallback(
    async (force = false) => {
      try {
        const payload = await loadScene(release.id, 'pitch', { force });
        if (payload) setPitches(payload.pitches);
      } finally {
        setIsLoadingPitches(false);
      }
    },
    [loadScene, release.id]
  );

  useEffect(() => {
    void refreshPitches();
  }, [refreshPitches]);

  const waitingCount = useMemo(() => countWaitingPitches(pitches), [pitches]);
  const atLimit = waitingCount >= MAX_WAITING_PITCHES_PER_RELEASE;

  // Curators first, as a picture grid (founder, 2026-10-11). What was already
  // sent comes after, and only when there is something to show.
  return (
    <div className="mt-6 space-y-10">
      {hasCuratorProfile === true || (paymentsOn && paymentCancelled) ? (
        <div className="space-y-3">
          {/* A dual account owns playlists as well as releases; its inbox is
              a separate surface with its own shell. */}
          {hasCuratorProfile === true ? (
            <Link
              href="/curator"
              className="motion-focus inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand hover:underline"
            >
              Your curator inbox
            </Link>
          ) : null}
          {paymentsOn && paymentCancelled ? (
            <p
              role="status"
              className="rounded-lg border border-status-warning/30 bg-status-warning/10 p-4 text-sm text-status-warning"
            >
              {PAYMENT_FAILED}
            </p>
          ) : null}
        </div>
      ) : null}

      <section aria-label="Pick a curator" className="space-y-4">
        <h3 className="font-display text-xl font-semibold text-content-primary">Pick a curator</h3>
        <PitchComposer
          releaseId={release.id}
          curatorSlug={curatorSlug}
          onClearCurator={() => setCuratorSlug('')}
          initialSongTitle={release.title || ''}
          atLimit={atLimit}
          // Refetch rather than appending the returned row: this scene reads
          // through the scene cache, so the cache is what has to learn about
          // the new pitch. Appending locally would leave the cached copy a
          // pitch behind for the rest of the session.
          onSent={() => void refreshPitches(true)}
          onChanged={() => void refreshPitches(true)}
          onToast={onToast}
        />
      </section>

      {isLoadingPitches ? (
        <CuratorCardListSkeleton rows={1} />
      ) : pitches.length > 0 ? (
        <section aria-label="Pitches sent" className="space-y-3">
          <h3 className="font-display text-xl font-semibold text-content-primary">Answers</h3>
          <ul className="space-y-2">
            {pitches.map((pitch) => (
              <SentPitchRow key={pitch.id} pitch={pitch} onChanged={() => void refreshPitches(true)} />
            ))}
          </ul>
        </section>
      ) : null}

      <EditorialPitchSection releaseId={release.id} />

      {paymentsOn ? (
        <section aria-label="Payments" className="space-y-3">
          <h3 className="font-display text-xl font-semibold text-content-primary">Payments</h3>
          <PitchPayments releaseId={release.id} />
        </section>
      ) : null}
    </div>
  );
}
