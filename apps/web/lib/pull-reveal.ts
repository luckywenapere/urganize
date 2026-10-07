// Pull-down-to-reveal for the search and filter panel on mobile lists
// (2026-10-07, founder call).
//
// On a phone the search box, the status chips and the sort control sat above
// the list and pushed the first rollout below the fold. They now stay folded
// away until the person pulls the page down while already at the very top,
// the way a mail app reveals its search. This file is the rule; PullReveal
// only feeds it measurements.

/** How far a finger has to drag down, from the top, before the panel opens. */
export const PULL_OPEN_PX = 48;
/** Scrolling the page down further than this folds the panel away again. */
export const SCROLL_HIDE_PX = 40;
/** At or under this the page counts as "at the very top". */
export const AT_TOP_PX = 2;

/** The page width below which the panel folds. Matches Tailwind's `sm`. */
export const FOLD_BELOW_PX = 640;

/** Event the top bar's search button sends to open the panel. */
export const REVEAL_EVENT = 'urganize:reveal-list-search';

/** True when a touch that began at the top has pulled down far enough. */
export function shouldRevealOnPull(input: { startedAtTop: boolean; startY: number; currentY: number }): boolean {
  if (!input.startedAtTop) return false;
  return input.currentY - input.startY >= PULL_OPEN_PX;
}

/** True when a scroll position means "the person moved on, fold it away". */
export function shouldHideOnScroll(input: { scrollTop: number; focused: boolean }): boolean {
  // Never fold it from under someone who is typing into it.
  if (input.focused) return false;
  return input.scrollTop > SCROLL_HIDE_PX;
}

/**
 * Whether the panel is showing. A search or filter that is doing something
 * keeps it open, because a list that is quietly filtered with nothing on screen
 * saying why looks broken. Wide screens always show it.
 */
export function isPanelShown(input: { revealed: boolean; filtering: boolean; wide: boolean }): boolean {
  return input.wide || input.revealed || input.filtering;
}
