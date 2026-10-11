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

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Release } from '@/types/releases';
import type { SentPitch } from '@/types/pitching';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { MAX_WAITING_PITCHES_PER_RELEASE, countWaitingPitches } from '@/lib/pitching';
import { CuratorCardListSkeleton } from '@/components/loading/CuratorSkeleton';
import { PitchComposer } from './PitchComposer';
import { SentPitchRow } from './SentPitchRow';

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
      <section aria-label="Pick a curator" className="space-y-4">
        <h3 className="font-display text-xl font-semibold text-content-primary">Pick a curator</h3>
        <PitchComposer
          releaseId={release.id}
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
    </div>
  );
}
