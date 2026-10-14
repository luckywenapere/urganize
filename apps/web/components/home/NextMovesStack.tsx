'use client';

import { HOME_BLOCK_LABELS } from '@/lib/home/sections';
import type { NextMove } from '@/lib/next-moves';
import { NextMoveCard } from '@/components/next-moves/NextMoveCard';
import { HomeStack } from './HomeStack';

/** Home's "Next moves" (URG-259): the same stack as every other Home group. */
export function NextMovesStack({
  moves,
  showRollout,
  onDismiss,
}: {
  moves: readonly NextMove[];
  showRollout: boolean;
  onDismiss: (move: NextMove) => void;
}) {
  return (
    <HomeStack
      label={HOME_BLOCK_LABELS['next-moves']}
      items={moves}
      getKey={(move) => move.key}
      renderItem={(move) => <NextMoveCard move={move} showRollout={showRollout} onDismiss={onDismiss} />}
    />
  );
}
