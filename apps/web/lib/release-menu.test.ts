import { describe, expect, it } from 'vitest';

import { RELEASE_MENU_ORDER, orderReleaseMenu } from './release-menu';

function keys(entries: { key: string }[]): string[] {
  return entries.map((entry) => entry.key);
}

function entriesFor(list: readonly string[]): { key: string }[] {
  return list.map((key) => ({ key }));
}

describe('RELEASE_MENU_ORDER', () => {
  /**
   * The order IS the deliverable of the 2026-08-31 change, so it is pinned
   * literally. Reordering the menu should be a deliberate edit that updates
   * this list and this assertion together, not something that drifts in
   * because somebody added an entry next to a related one.
   */
  it('is the documented sequence', () => {
    expect([...RELEASE_MENU_ORDER]).toEqual([
      'plan',
      'activities',
      'calendar',
      'pitch',
      'metadata',
      'coverart',
      'song',
      'files',
      'status-update',
      'capture',
      'recap',
      'change-artist',
      'archive',
    ]);
  });

  it('lists every key exactly once', () => {
    expect(new Set(RELEASE_MENU_ORDER).size).toBe(RELEASE_MENU_ORDER.length);
  });

  /** The gradient the module header argues for, asserted as relative
   *  positions so it survives an insertion between any two of them. */
  it('puts the surfaces a rollout returns to above the ones it visits once', () => {
    const position = (key: string) => RELEASE_MENU_ORDER.indexOf(key as never);

    // Marketing is the biggest block of a rollout, asset production is a
    // handful of touches early on.
    expect(position('calendar')).toBeLessThan(position('coverart'));
    expect(position('pitch')).toBeLessThan(position('song'));
    // Working surfaces before the things you send outward.
    expect(position('metadata')).toBeLessThan(position('capture'));
    // Everything before the end-of-release and corrective actions.
    expect(position('capture')).toBeLessThan(position('recap'));
    expect(position('recap')).toBeLessThan(position('archive'));
    expect(position('change-artist')).toBeLessThan(position('archive'));
  });
});

describe('orderReleaseMenu', () => {
  it('sorts entries into the canonical order regardless of how they arrive', () => {
    const scrambled = entriesFor(['archive', 'plan', 'capture', 'activities', 'song']);

    expect(keys(orderReleaseMenu(scrambled))).toEqual([
      'plan',
      'activities',
      'song',
      'capture',
      'archive',
    ]);
  });

  it('keeps relative order when most entries are missing', () => {
    // The realistic case: production has most of these flags off, so the menu
    // is a handful of items and they still have to come out in the right
    // sequence relative to each other.
    const sparse = entriesFor(['archive', 'metadata', 'calendar']);

    expect(keys(orderReleaseMenu(sparse))).toEqual(['calendar', 'metadata', 'archive']);
  });

  it('does not mutate the array it was given', () => {
    const entries = entriesFor(['archive', 'plan']);
    const before = keys(entries);

    orderReleaseMenu(entries);

    expect(keys(entries)).toEqual(before);
  });

  it('sorts an unranked key to the END, never the front', () => {
    // Unreachable from TypeScript (ReleaseMenuKey is a closed union), so this
    // only matters if a key ever arrives untyped — and the tail is where an
    // entry nobody has ranked belongs. Landing at the front would put an
    // unranked item above Plan, which is the one position that is argued for.
    const entries = entriesFor(['archive', 'not-a-real-key', 'plan']);

    expect(keys(orderReleaseMenu(entries))).toEqual(['plan', 'archive', 'not-a-real-key']);
  });

  it('preserves input order among several unranked keys', () => {
    const entries = entriesFor(['zeta', 'alpha']);

    expect(keys(orderReleaseMenu(entries))).toEqual(['zeta', 'alpha']);
  });

  it('returns the full menu in exactly the documented order', () => {
    const shuffled = entriesFor([...RELEASE_MENU_ORDER].reverse());

    expect(keys(orderReleaseMenu(shuffled))).toEqual([...RELEASE_MENU_ORDER]);
  });
});
