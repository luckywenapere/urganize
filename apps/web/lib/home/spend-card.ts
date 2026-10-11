/**
 * Where Home's "Where the money went" card sends a tap (2026-10-11, founder
 * call: the card was display only, so a manager had to open a rollout, then
 * its menu, then Track spend to add the first figure).
 *
 * The card opens a rollout's Spend scene, the same scene the menu's Track spend
 * row opens. Which rollout: the active one first, meaning the next one coming
 * out (the soonest release day still ahead), then the ones already out, most
 * recent first, then any with no date. When there are several, the card shows
 * a small picker that defaults to that first one. Pure so the order is tested.
 */

import type { HomeReleaseSummary } from './types';

export type SpendCardRollout = Pick<HomeReleaseSummary, 'id' | 'title' | 'artistName' | 'daysOut'>;

/** The `?field=` value that lands the Spend scene with its add form open. */
export const SPEND_ADD_FIELD = 'add';

/** How many rollouts the card asks about. Each one is a read, and a picker
 *  past this is a list nobody scrolls. */
export const SPEND_CARD_ROLLOUT_LIMIT = 8;

function rank(daysOut: number | null): [number, number] {
  if (daysOut === null) return [2, 0];
  if (daysOut >= 0) return [0, daysOut];
  return [1, -daysOut];
}

/** The rollouts in the order the card offers them, the default first. */
export function orderSpendCardRollouts<T extends SpendCardRollout>(rollouts: readonly T[]): T[] {
  return rollouts
    .map((rollout, index) => ({ rollout, index, key: rank(rollout.daysOut) }))
    .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.index - b.index)
    .map((entry) => entry.rollout);
}

/** The Spend scene of one rollout, optionally with the add form open. */
export function spendSceneHref(releaseId: string, options?: { add?: boolean }): string {
  const params = new URLSearchParams({ release: releaseId, scene: 'spend' });
  if (options?.add) params.set('field', SPEND_ADD_FIELD);
  return `/dashboard?${params.toString()}`;
}
