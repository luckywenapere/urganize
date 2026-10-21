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
import { CuratorPicker } from './CuratorPicker';
import { PromoList } from './PromoList';
import { PitchKitSection, type KitShareState } from '@/components/releases/PitchKitSection';
import type { Task } from '@/types/tasks';
import { SentPitchRow } from './SentPitchRow';
import { EditorialPitchSection } from './EditorialPitchSection';
import { showEditorialPitch } from '@/lib/release-out';
import { CreditPitchPicker } from './CreditPitchPicker';
import { CreditAnswers } from './CreditAnswers';
import { useAuthStore } from '@/lib/auth-store';
import { isValidCuratorSlug } from '@/lib/curator-public';
import { isPitchCreditsEnabled } from '@/lib/pitch-credits';
import { useIsomorphicLayoutEffect } from '@/lib/use-isomorphic-layout-effect';

/** ?curator= (from a curator's public page) and ?payment=cancelled (Paystack's
 *  cancel link), read once and imperatively: the workspace owns the URL, and a
 *  hook here would only re-read what never changes while the scene is open. */
function readSceneParams(): { curatorSlug: string; paymentCancelled: boolean; reference: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const slug = (params.get('curator') || '').trim().toLowerCase();
    return {
      curatorSlug: isValidCuratorSlug(slug) ? slug : '',
      paymentCancelled: params.get('payment') === 'cancelled',
      reference: (params.get('reference') || params.get('trxref') || '').trim(),
    };
  } catch {
    return { curatorSlug: '', paymentCancelled: false, reference: '' };
  }
}

// Pitch on credits (URG-345, Oct 17, 2026): ships on. Read once; a
// NEXT_PUBLIC_ flag is inlined at build time.
const CREDITS_ON = isPitchCreditsEnabled();

const PITCH_KIT_ON = process.env.NEXT_PUBLIC_FEATURE_PITCH_KIT === 'true';

type PitchSceneProps = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'releaseDate'>;
  /** The rollout's activities, so Promo can mark what is already planned. */
  tasks?: Task[];
  /** A promo channel was put on the plan; re-read the workspace. */
  onTaskAdded?: () => void;
  onToast: (message: string, tone: 'success' | 'error' | 'warning') => void;
};

export function PitchScene({ release, tasks = [], onTaskAdded, onToast }: PitchSceneProps) {
  const loadScene = useSceneDataStore((state) => state.loadScene);
  const getScene = useSceneDataStore((state) => state.getScene);
  const cached = getScene(release.id, 'pitch');

  const [pitches, setPitches] = useState<SentPitch[]>(cached?.pitches || []);
  const [isLoadingPitches, setIsLoadingPitches] = useState(!cached);
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
  const [curatorSlug, setCuratorSlug] = useState('');
  const [paymentCancelled, setPaymentCancelled] = useState(false);
  const [topUpReference, setTopUpReference] = useState('');
  const [paramsRead, setParamsRead] = useState(false);
  useIsomorphicLayoutEffect(() => {
    const params = readSceneParams();
    setCuratorSlug(params.curatorSlug);
    setPaymentCancelled(params.paymentCancelled);
    setTopUpReference(params.reference);
    setParamsRead(true);
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

  // What the kit block reports, so a pitch can carry the kit link.
  const [kit, setKit] = useState<KitShareState>({ url: null, ready: false, story: '' });

  const waitingCount = useMemo(() => countWaitingPitches(pitches), [pitches]);
  const atLimit = waitingCount >= MAX_WAITING_PITCHES_PER_RELEASE;

  // 2026-10-16, Pitch this! as one place (founder approved mocks): the kit on
  // top, then curators, their answers, the editors, and promo. Three tabs
  // (Pitch this!, Build your pitch kit, Find promo) became this one, so the
  // kit link a pitch carries is made on the same screen it is sent from. One
  // accent action on screen at a time: the kit's, until a sheet is open.
  return (
    <div className="mt-6 space-y-10">
      {/* The Paystack pitch checkout's cancelled notice and its Payments
          receipts section were removed here with Pitch on credits (URG-345);
          the paid-pitch rows and receipts stay in the database. */}
      {hasCuratorProfile === true ? (
        <div className="space-y-3">
          <Link
            href="/curator"
            className="motion-focus inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand hover:underline"
          >
            Your curator inbox
          </Link>
        </div>
      ) : null}

      {PITCH_KIT_ON ? (
        <PitchKitSection releaseId={release.id} onToast={onToast} onShareStateChange={setKit} />
      ) : null}

      {CREDITS_ON ? (
        paramsRead ? (
          <CreditPitchPicker
            releaseId={release.id}
            songTitle={release.title || ''}
            story={kit.story}
            kitUrl={kit.url}
            kitReady={kit.ready}
            atLimit={atLimit}
            curatorSlug={curatorSlug}
            topUpReference={topUpReference}
            topUpCancelled={paymentCancelled}
            onSent={() => void refreshPitches(true)}
            onToast={onToast}
          />
        ) : null
      ) : (
      <section aria-label="Send to curators">
        <h3 className="mb-3 font-display text-xl text-content-primary">Send to curators</h3>
        <CuratorPicker
          releaseId={release.id}
          songTitle={release.title || ''}
          story={kit.story}
          kitUrl={kit.url}
          kitReady={kit.ready}
          atLimit={atLimit}
          curatorSlug={curatorSlug}
          // Refetch rather than appending: this scene reads through the scene
          // cache, so the cache is what has to learn about the new pitch.
          onSent={() => void refreshPitches(true)}
          onToast={onToast}
        />
      </section>
      )}

      {isLoadingPitches ? (
        <CuratorCardListSkeleton rows={1} />
      ) : pitches.length > 0 && CREDITS_ON ? (
        <CreditAnswers pitches={pitches} />
      ) : pitches.length > 0 ? (
        <section aria-label="Answers" className="space-y-3">
          <h3 className="font-display text-xl text-content-primary">Answers</h3>
          <ul className="space-y-2">
            {pitches.map((pitch) => (
              <SentPitchRow key={pitch.id} pitch={pitch} onChanged={() => void refreshPitches(true)} />
            ))}
          </ul>
        </section>
      ) : null}

      {showEditorialPitch(release.releaseDate) ? (
        <EditorialPitchSection releaseId={release.id} releaseDate={release.releaseDate ?? null} />
      ) : null}

      <PromoList release={release} tasks={tasks} onTaskAdded={onTaskAdded ?? (() => {})} onToast={onToast} />

    </div>
  );
}
