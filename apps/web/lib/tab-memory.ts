// Tabs remember where you were (Nov 2, 2026, founder: "it didn't persist the
// state"). Home is the only tab with pages pushed on top of it (an artist, a
// rollout and its plan or brief), so it is the one that needs a memory: leave
// a rollout for its session and swipe back, and Home opens on that rollout
// again, not on the artist list.
//
// PURE so the rule is tested without a DOM. The store and the pager use it.

export type TabMemoryPlace = {
  /** pathname + search, e.g. /dashboard?release=r1&scene=brief */
  path: string;
  /** The place is one of the swipe tabs themselves (Home, Assistant, ...). */
  onTab: boolean;
  /** swipeAreaForPath: which tab the place belongs to ('artists' = Home). */
  area: string | null;
};

/**
 * What Home remembers after moving from `previous` to `current`.
 *  - On a page pushed over Home: remember it.
 *  - Back on Home's own list straight from such a page (its back arrow, or the
 *    Home tab tapped while on it): forget, the person chose the list.
 *  - Anything else (another tab, settings): keep what was remembered.
 */
export function nextHomeMemory(
  remembered: string | null,
  previous: TabMemoryPlace | null,
  current: TabMemoryPlace
): string | null {
  if (!current.onTab && current.area === 'artists') return current.path;
  if (current.onTab && current.area === 'artists' && previous && !previous.onTab && previous.area === 'artists') {
    return null;
  }
  return remembered;
}
