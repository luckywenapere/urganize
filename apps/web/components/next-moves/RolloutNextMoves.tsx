'use client';

import { useMemo } from 'react';
import { NEXT_MOVE_COPY, type NextMoveRollout, type NextMoveTask } from '@/lib/next-moves';
import { NextMoveCard } from './NextMoveCard';
import { useNextMoves } from './useNextMoves';

/**
 * The rollout page's next moves (URG-259): up to three cards above the main
 * view, worked out from the rollout and its activities. Draws nothing when
 * there is nothing to do next.
 */
export function RolloutNextMoves({
  release,
  tasks,
  isOwner,
}: {
  release: { id: string; title: string; releaseDate: string | null; status?: string | null };
  tasks: readonly NextMoveTask[];
  isOwner: boolean;
}) {
  const rollouts = useMemo<NextMoveRollout[]>(
    () => [
      {
        id: release.id,
        title: release.title,
        releaseDate: release.releaseDate,
        status: release.status ?? null,
        isOwner,
        tasks,
        pitches: null,
      },
    ],
    [release.id, release.title, release.releaseDate, release.status, isOwner, tasks]
  );
  const { moves, dismiss } = useNextMoves({ surface: 'rollout', rollouts, releaseId: release.id });
  if (moves.length === 0) return null;

  return (
    <section aria-label={NEXT_MOVE_COPY.label} className="mb-4">
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
        {NEXT_MOVE_COPY.label}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {moves.map((move) => (
          <li key={move.key} className="relative rounded-2xl border border-stroke-default bg-bg-surface p-4">
            <NextMoveCard move={move} showRollout={false} onDismiss={dismiss} />
          </li>
        ))}
      </ul>
    </section>
  );
}
