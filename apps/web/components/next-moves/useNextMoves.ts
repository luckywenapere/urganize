'use client';

import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { pickNextMoves, type NextMove, type NextMoveRollout, type NextMoveSurface } from '@/lib/next-moves';
import { selectNextMovesSettled, useNextMovesStore } from '@/stores/useNextMovesStore';

export const NEXT_MOVE_FLAGS = {
  planner: process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true',
  pitching: process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true',
};

/**
 * The moves to show on a surface, with dismissals applied. `releaseId` (the
 * rollout page) also loads that rollout's pitch facts; Home passes its own.
 */
export function useNextMoves(input: {
  surface: NextMoveSurface;
  rollouts: readonly NextMoveRollout[];
  releaseId?: string | null;
}): { moves: NextMove[]; dismiss: (move: NextMove) => void } {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const dismissed = useNextMovesStore((state) => state.dismissed);
  const pitches = useNextMovesStore((state) => state.pitches);
  const hasTeam = useNextMovesStore((state) => state.hasTeam);
  const load = useNextMovesStore((state) => state.load);
  const dismissKey = useNextMovesStore((state) => state.dismiss);
  const { surface, rollouts, releaseId } = input;
  // No card until this surface's server dismissals are known (URG-364 Home,
  // URG-367 rollout page). Before, the rollout page drew from this device's
  // local copy, so a move dismissed on another device showed with its X and
  // "Open it" for a moment, then vanished. The store settles on an answer, a
  // failure, no session or a 4s timeout, so a slow server never hides the
  // cards for good. Nothing is reserved while waiting: the cards appear once.
  const settled = useNextMovesStore(selectNextMovesSettled(userId, releaseId ?? null));

  useEffect(() => {
    if (userId) load(userId, releaseId ?? null);
  }, [userId, releaseId, load]);

  const moves = useMemo(() => {
    if (!userId || !settled) return [];
    const withPitches = rollouts.map((rollout) =>
      rollout.pitches === null && rollout.id in pitches ? { ...rollout, pitches: pitches[rollout.id] } : rollout
    );
    return pickNextMoves({
      rollouts: withPitches,
      dismissed,
      now: new Date(),
      flags: NEXT_MOVE_FLAGS,
      surface,
      hasTeam,
    });
  }, [userId, settled, rollouts, pitches, dismissed, surface, hasTeam]);

  return {
    moves,
    dismiss: (move) => {
      if (userId) dismissKey(userId, move.key);
    },
  };
}
