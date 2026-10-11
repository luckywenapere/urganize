'use client';

import { useEffect, useMemo } from 'react';
import { orderSpendCardRollouts, SPEND_CARD_ROLLOUT_LIMIT } from '@/lib/home/spend-card';
import type { HomeReleaseSummary } from '@/lib/home/types';
import { useSpendAccessStore } from '@/stores/useSpendAccessStore';

/**
 * The rollouts Home's money card can open, in the order it offers them: the
 * viewer's rollouts in flight whose spend the server has said they may see.
 *
 * Each one is asked through the same store the rollout menu's Track spend row
 * uses, so a rollout the menu would not offer the card does not offer either,
 * and an answer one surface got is reused by the other. Asked only for a
 * manager (`enabled`), and only for the first few rollouts in order.
 */
export function useSpendRollouts(
  rollouts: readonly HomeReleaseSummary[],
  enabled: boolean
): HomeReleaseSummary[] {
  const ordered = useMemo(
    () => (enabled ? orderSpendCardRollouts(rollouts).slice(0, SPEND_CARD_ROLLOUT_LIMIT) : []),
    [rollouts, enabled]
  );
  const byRelease = useSpendAccessStore((state) => state.byRelease);
  const probe = useSpendAccessStore((state) => state.probe);

  const idsKey = ordered.map((rollout) => rollout.id).join(',');
  useEffect(() => {
    for (const id of idsKey ? idsKey.split(',') : []) void probe(id);
  }, [idsKey, probe]);

  return useMemo(() => ordered.filter((rollout) => byRelease[rollout.id] === true), [ordered, byRelease]);
}
