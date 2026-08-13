import { describe, expect, it } from 'vitest';
import { buildStatusTiles, type StatusFacts } from './release-status';

// The tiles sit above a generated paragraph so a manager can check the AI's
// narration against the data it was written from. Two properties are worth
// pinning: a tile never renders as a zero (a row of zeroes buries the figures
// that matter), and blocked work is the one figure allowed to shout.

const BASE: StatusFacts = {
  totalCount: 64,
  doneCount: 12,
  inProgressCount: 0,
  blockedCount: 0,
  dueThisWeekCount: 0,
};

const withOverrides = (overrides: Partial<StatusFacts>) =>
  buildStatusTiles({ ...BASE, ...overrides });

const keysOf = (tiles: ReturnType<typeof buildStatusTiles>) => tiles.map((tile) => tile.key);

describe('buildStatusTiles', () => {
  it('always shows Done, with the total as its detail line', () => {
    const tiles = withOverrides({});
    expect(keysOf(tiles)).toEqual(['done']);
    expect(tiles[0]).toMatchObject({ value: '12', label: 'Done', detail: 'of 64' });
  });

  it('shows Done even at zero — it is the progress anchor, not an achievement', () => {
    const tiles = withOverrides({ doneCount: 0 });
    expect(keysOf(tiles)).toEqual(['done']);
    expect(tiles[0].value).toBe('0');
  });

  it('drops the detail line when there is no denominator worth printing', () => {
    // A release with no activities at all: "0 of 0" says less than "0".
    expect(withOverrides({ totalCount: 0, doneCount: 0 })[0].detail).toBeUndefined();
  });

  it('omits in progress, due and blocked when each is zero', () => {
    // The absence of news is not news. Padding the row with zeroes would bury
    // the one figure that does carry signal.
    expect(keysOf(withOverrides({}))).toEqual(['done']);
  });

  it('adds each optional tile only once its count is non-zero', () => {
    expect(keysOf(withOverrides({ inProgressCount: 3 }))).toEqual(['done', 'in-progress']);
    expect(keysOf(withOverrides({ dueThisWeekCount: 5 }))).toEqual(['done', 'due-this-week']);
    expect(keysOf(withOverrides({ blockedCount: 2 }))).toEqual(['done', 'blocked']);
  });

  it('keeps a fixed order when every tile is present', () => {
    const tiles = withOverrides({ inProgressCount: 3, dueThisWeekCount: 5, blockedCount: 2 });
    expect(keysOf(tiles)).toEqual(['done', 'in-progress', 'due-this-week', 'blocked']);
  });

  it('gives blocked the alert tone, and nothing else', () => {
    const tiles = withOverrides({ inProgressCount: 3, dueThisWeekCount: 5, blockedCount: 2 });
    const alerting = tiles.filter((tile) => tile.tone === 'alert').map((tile) => tile.key);
    expect(alerting).toEqual(['blocked']);
  });

  it('reports the true due-this-week count, not a capped one', () => {
    // The route's `comingUpThisWeek` title list caps at five because it feeds a
    // prompt; dueThisWeekCount is uncapped so a busy week is not under-reported
    // as a fact on screen.
    const tiles = withOverrides({ dueThisWeekCount: 9 });
    expect(tiles.find((tile) => tile.key === 'due-this-week')?.value).toBe('9');
  });
});
