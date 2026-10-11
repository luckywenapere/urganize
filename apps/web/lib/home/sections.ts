/**
 * Which blocks Home shows, and in what order (2026-10-07, founder call). The
 * same order on a phone and a desktop:
 *
 *   Getting started (only while a team is setting up), Tasks (or Up next when
 *   there are none), For you today, Waiting on others, Next show, Rollouts,
 *   Placements, Where the money went (managers who may track spend), then
 *   UrgAns' line for the day.
 *
 * A group with nothing in it is left out entirely: Home never shows an empty
 * state. The one exception is Where the money went, which a manager sees empty
 * so the first spend has a place to be added from. Pure so the order and the drops can be tested.
 */

import { SPEND_COPY } from '../release-spend';

export type HomeBlockKey =
  | 'onboarding'
  | 'tasks'
  | 'up-next'
  | 'attention'
  | 'waiting'
  | 'next-show'
  | 'rollouts'
  | 'placements'
  | 'spend'
  | 'daily-line';

export type HomeBlocksInput = {
  /** The getting-started bar has steps left (the bar hides itself when closed). */
  onboardingVisible: boolean;
  taskCount: number;
  /** What the Up next card would point at, or null when it should not show. */
  upNext: 'show' | 'release' | 'start' | null;
  attentionCount: number;
  waitingCount: number;
  hasNextShow: boolean;
  rolloutCount: number;
  placementCount: number;
  /**
   * The viewer is a manager and either their rollouts spent something in the
   * last 90 days or there is a rollout they may track spend on. Since
   * 2026-10-11 the card shows with no spend yet (empty copy plus Add spend), so
   * the first figure has somewhere to go.
   */
  showSpend: boolean;
  /** Late tasks of the viewer's own: UrgAns' daily line waits for a day with none. */
  lateCount: number;
};

/** The word on each group's chip. The object is a rollout, never a release. */
export const HOME_BLOCK_LABELS = {
  tasks: 'Tasks',
  'up-next': 'Up next',
  attention: 'For you today',
  waiting: 'Waiting on others',
  'next-show': 'Next show',
  rollouts: 'Rollouts',
  placements: 'Placements',
  spend: SPEND_COPY.homeTitle,
} as const;

export function orderHomeBlocks(input: HomeBlocksInput): HomeBlockKey[] {
  const blocks: HomeBlockKey[] = [];
  if (input.onboardingVisible) blocks.push('onboarding');

  const showUpNext = input.taskCount === 0 && input.upNext !== null;
  if (input.taskCount > 0) blocks.push('tasks');
  else if (showUpNext) blocks.push('up-next');

  if (input.attentionCount > 0) blocks.push('attention');
  if (input.waitingCount > 0) blocks.push('waiting');
  // When Up next is already the coming show, a second card for it says the
  // same thing twice.
  if (input.hasNextShow && !(showUpNext && input.upNext === 'show')) blocks.push('next-show');
  if (input.rolloutCount > 0) blocks.push('rollouts');
  if (input.placementCount > 0) blocks.push('placements');
  if (input.showSpend) blocks.push('spend');
  if (input.lateCount === 0) blocks.push('daily-line');
  return blocks;
}
