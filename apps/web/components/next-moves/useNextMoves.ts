'use client';

import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import { pickNextMoves, type NextMove, type NextMoveRollout, type NextMoveSurface } from '@/lib/next-moves';
import { useNextMovesStore } from '@/stores/useNextMovesStore';

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
  const load = useNextMovesStore((state) => state.load);
  const dismissKey = useNextMovesStore((state) => state.dismiss);
  const { surface, rollouts, releaseId } = input;

  useEffect(() => {
    if (userId) load(userId, releaseId ?? null);
  }, [userId, releaseId, load]);

  const moves = useMemo(() => {
    if (!userId) return [];
    const withPitches = rollouts.map((rollout) =>
      rollout.pitches === null && rollout.id in pitches ? { ...rollout, pitches: pitches[rollout.id] } : rollout
    );
    return pickNextMoves({
      rollouts: withPitches,
      dismissed,
      now: new Date(),
      flags: NEXT_MOVE_FLAGS,
      surface,
    });
  }, [userId, rollouts, pitches, dismissed, surface]);

  return {
    moves,
    dismiss: (move) => {
      if (userId) dismissKey(userId, move.key);
    },
  };
}
