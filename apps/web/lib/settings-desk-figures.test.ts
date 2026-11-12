import { describe, expect, it } from 'vitest';
import { creditMeter, formatHistoryAmount, groupHistoryByDay, overageIsOn } from './credits/history';
import { sortTrashSoonestFirst, trashGoneIn, trashGoneInIsClose } from './rollout-trash';
import { seatMeter, teamSeesLabel } from './team-page';

// The figures the desktop settings pages print (#1226). Pure, so the copy and
// the ordering are pinned here rather than in a component.

describe('AI credits history', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const entry = (id: string, at: string, credits: number) => ({ id, at, label: 'AI chat', detail: '', credits });

  it('groups by Lagos day, Today and Yesterday first, then dates', () => {
    const groups = groupHistoryByDay(
      [
        entry('a', '2026-11-12T08:21:00Z', -10),
        entry('b', '2026-11-11T23:30:00Z', -4), // 00:30 on the 12th in Lagos
        entry('c', '2026-11-11T09:00:00Z', -2),
        entry('d', '2026-11-05T09:00:00Z', -14),
        entry('e', '2025-12-30T09:00:00Z', 150),
      ],
      now
    );
    expect(groups.map((group) => [group.label, group.entries.map((item) => item.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['5 Nov', ['d']],
      ['30 Dec 2025', ['e']],
    ]);
  });

  it('prints spends with no minus sign and additions with a plus', () => {
    expect(formatHistoryAmount(-10)).toBe('10');
    expect(formatHistoryAmount(-1200)).toBe('1,200');
    expect(formatHistoryAmount(150)).toBe('+150');
    expect(formatHistoryAmount(0)).toBe('0');
  });

  it('measures what is left of the month', () => {
    expect(creditMeter({ balance: 120, allowance: 150 })).toEqual({ left: 120, of: 150, share: 80 });
    expect(creditMeter({ balance: 400, allowance: 150 })).toEqual({ left: 400, of: 150, share: 100 });
    expect(creditMeter({ balance: -3, allowance: 150 })).toEqual({ left: 0, of: 150, share: 0 });
    expect(creditMeter({ balance: 20, allowance: 0 })).toEqual({ left: 20, of: 0, share: 0 });
  });

  it('reads paying past your credits as off at a 0 cap', () => {
    expect(overageIsOn(0)).toBe(false);
    expect(overageIsOn(7500)).toBe(true);
  });
});

describe('Trash', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  it('sorts soonest gone first', () => {
    const sorted = sortTrashSoonestFirst([
      { id: 'new', deletedAt: '2026-11-11T10:00:00Z' },
      { id: 'old', deletedAt: '2026-10-20T10:00:00Z' },
      { id: 'mid', deletedAt: '2026-11-01T10:00:00Z' },
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['old', 'mid', 'new']);
  });

  it('says how long is left in plain words', () => {
    expect(trashGoneIn('2026-10-21T10:00:00Z', now)).toBe('8 days');
    expect(trashGoneIn('2026-10-14T10:00:00Z', now)).toBe('1 day');
    expect(trashGoneIn('2026-10-01T10:00:00Z', now)).toBe('Today');
  });

  it('is red only under 7 days', () => {
    expect(trashGoneInIsClose(6)).toBe(true);
    expect(trashGoneInIsClose(7)).toBe(false);
    expect(trashGoneInIsClose(0)).toBe(true);
  });
});

describe('Team', () => {
  it('says Everything when nothing is limited', () => {
    expect(teamSeesLabel({ kind: 'all' })).toBe('Everything');
    expect(teamSeesLabel({ kind: 'artist', artistId: 'x', artistName: 'Kemi Ade' })).toBe('Kemi Ade only');
    expect(teamSeesLabel({ kind: 'rollouts', releaseIds: ['a'], releaseTitles: ['A'] })).toBe('1 rollout');
  });

  it('fills the seat meter, and has none without a limit', () => {
    expect(seatMeter(8, 10)).toEqual({ line: '8 of 10 seats', share: 80 });
    expect(seatMeter(12, 10)).toEqual({ line: '12 of 10 seats', share: 100 });
    expect(seatMeter(3, null)).toEqual({ line: '3 on the team', share: null });
  });
});
