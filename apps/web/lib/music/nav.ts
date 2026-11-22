/**
 * Urganize Music's two tabs and the swipe between them (#1364). Pure, so the
 * rules a finger meets are held by tests rather than buried in a component.
 */

export type MusicTabKey = 'home' | 'collection';

export const MUSIC_TABS: ReadonlyArray<{ key: MusicTabKey; label: string; href: string }> = [
  { key: 'home', label: 'Home', href: '/music' },
  { key: 'collection', label: 'Collection', href: '/music/collection' },
];

/** The tab a page belongs to, or null for a page pushed on top (Search). */
export function musicTabForPath(pathname: string): MusicTabKey | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/music') return 'home';
  if (path === '/music/collection' || path.startsWith('/music/collection/')) return 'collection';
  return null;
}

/** A sideways swipe must travel this far, and be clearly more sideways than
 *  up or down, before it changes the tab. */
export const MUSIC_SWIPE_MIN_PX = 60;

/** Where a swipe on a tab goes: left to the next tab, right to the one before,
 *  nowhere past either end, and nowhere for a scroll or a short drag. */
export function musicSwipeTarget(tab: MusicTabKey | null, dx: number, dy: number): string | null {
  if (!tab) return null;
  if (Math.abs(dx) < MUSIC_SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  const index = MUSIC_TABS.findIndex((item) => item.key === tab);
  const next = MUSIC_TABS[index + (dx < 0 ? 1 : -1)];
  return next ? next.href : null;
}
