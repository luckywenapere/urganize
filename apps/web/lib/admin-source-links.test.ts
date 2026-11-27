import { describe, expect, it } from 'vitest';
import {
  SOURCE_LINK_PLAN_LABEL,
  SOURCE_LINK_RECENT_SIGNUPS,
  buildSourceLinkStats,
  formatSignupRate,
  planFromTeamState,
  sourceLinkWeekStarts,
  type SourceLinkStatsInput,
} from './admin-source-links';
import { SOURCE_LINKS, type SourceLink } from './source-links';

// /admin/source-links (2026-11-27, #1409): taps and sign-ups per short link.
// A Friday, so "this week" began on Monday 23 Nov (Lagos) and "last week" on
// Monday 16 Nov.
const NOW = Date.parse('2026-11-27T12:00:00+01:00');

const LINKS: SourceLink[] = [
  { slug: 'x', source: 'x', medium: 'social', label: 'X' },
  { slug: 'ig', source: 'instagram', medium: 'social', label: 'Instagram' },
  { slug: 'tt', source: 'tiktok', medium: 'social', label: 'TikTok' },
  { slug: 'trm', source: 'therealmusicdistro', medium: 'partner', label: 'Therealmusicdistro' },
];

function input(over: Partial<SourceLinkStatsInput> = {}): SourceLinkStatsInput {
  return {
    now: NOW,
    links: LINKS,
    taps: [],
    signups: [],
    internalUserIds: new Set(),
    accounts: new Map(),
    rolloutOwnerIds: new Set(),
    planByUserId: new Map(),
    ...over,
  };
}

const tap = (slug: string, total: number, thisWeek = 0, lastWeek = 0, firstAt: string | null = null) => ({
  slug,
  total,
  thisWeek,
  lastWeek,
  firstAt,
});
const signup = (slug: string, user_id: string | null, created_at: string | null) => ({ slug, user_id, created_at });
const row = (stats: ReturnType<typeof buildSourceLinkStats>, slug: string) => stats.rows.find((r) => r.slug === slug)!;

describe('the week', () => {
  it('runs Monday to Sunday on the Lagos clock', () => {
    const weeks = sourceLinkWeekStarts(NOW);
    expect(new Date(weeks.thisWeek).toISOString()).toBe('2026-11-22T23:00:00.000Z');
    expect(new Date(weeks.lastWeek).toISOString()).toBe('2026-11-15T23:00:00.000Z');
    // Sunday 23:30 UTC is already Monday in Lagos.
    expect(new Date(sourceLinkWeekStarts(Date.parse('2026-11-29T23:30:00Z')).thisWeek).toISOString()).toBe(
      '2026-11-29T23:00:00.000Z'
    );
  });
});

describe('rows', () => {
  it('gives every link on the list a row, even with nothing counted', () => {
    const stats = buildSourceLinkStats(input());
    expect(stats.rows.map((r) => r.slug)).toEqual(['x', 'ig', 'tt', 'trm']);
    for (const r of stats.rows) {
      expect(r.listed).toBe(true);
      expect(r.taps).toEqual({ thisWeek: 0, lastWeek: 0, all: 0 });
      expect(r.signups).toEqual({ thisWeek: 0, lastWeek: 0, all: 0 });
      expect(r.ratePercent).toBeNull();
    }
    expect(stats.tracked).toBe(true);
    expect(stats.countingSince).toBeNull();
  });

  it('has a row for every real link', () => {
    const stats = buildSourceLinkStats(input({ links: SOURCE_LINKS }));
    expect(stats.rows).toHaveLength(SOURCE_LINKS.length);
    expect(row(stats, 'tt').label).toBe('TikTok');
    expect(row(stats, 'ig').label).toBe('Instagram');
  });

  it('puts the most sign-ups first, then the most taps, then the list order', () => {
    const stats = buildSourceLinkStats(
      input({
        taps: [tap('x', 50), tap('ig', 500), tap('tt', 90)],
        signups: [
          signup('tt', 'u1', '2026-11-24T10:00:00Z'),
          signup('tt', 'u2', '2026-11-25T10:00:00Z'),
          signup('x', 'u3', '2026-11-25T10:00:00Z'),
        ],
      })
    );
    expect(stats.rows.map((r) => r.slug)).toEqual(['tt', 'x', 'ig', 'trm']);
  });

  it('takes tap counts as the database gave them', () => {
    const stats = buildSourceLinkStats(input({ taps: [tap('tt', 120, 30, 45, '2026-11-12T08:00:00Z')] }));
    expect(row(stats, 'tt').taps).toEqual({ thisWeek: 30, lastWeek: 45, all: 120 });
    expect(stats.totals.taps).toEqual({ thisWeek: 30, lastWeek: 45, all: 120 });
    expect(stats.countingSince).toBe('2026-11-12T08:00:00.000Z');
  });

  it('keeps a link that left the list, named by its slug', () => {
    const stats = buildSourceLinkStats(
      input({ taps: [tap('old', 7)], signups: [signup('old', 'u1', '2026-11-20T10:00:00Z')] })
    );
    const old = row(stats, 'old');
    expect(old).toMatchObject({ listed: false, label: '/old', medium: 'removed' });
    expect(old.taps?.all).toBe(7);
    expect(old.signups?.all).toBe(1);
    expect(stats.recentSignups[0].label).toBe('/old');
  });
});

describe('sign-ups', () => {
  it('sorts each one into this week, last week or earlier, on the Lagos Monday', () => {
    const stats = buildSourceLinkStats(
      input({
        signups: [
          signup('ig', 'this-1', '2026-11-22T23:00:00Z'), // Monday 00:00 Lagos: this week
          signup('ig', 'this-2', '2026-11-27T09:00:00Z'),
          signup('ig', 'last-1', '2026-11-22T22:59:59Z'), // Sunday 23:59 Lagos: last week
          signup('ig', 'last-2', '2026-11-15T23:00:00Z'), // the Monday before
          signup('ig', 'older', '2026-11-15T22:59:59Z'),
        ],
      })
    );
    expect(row(stats, 'ig').signups).toEqual({ thisWeek: 2, lastWeek: 2, all: 5 });
    expect(stats.totals.signups).toEqual({ thisWeek: 2, lastWeek: 2, all: 5 });
  });

  it('leaves our own accounts out, but still knows counting had begun', () => {
    const stats = buildSourceLinkStats(
      input({
        internalUserIds: new Set(['us']),
        signups: [signup('x', 'us', '2026-11-11T10:00:00Z'), signup('x', 'them', '2026-11-20T10:00:00Z')],
      })
    );
    expect(row(stats, 'x').signups?.all).toBe(1);
    expect(stats.recentSignups.map((p) => p.userId)).toEqual(['them']);
    expect(stats.countingSince).toBe('2026-11-11T10:00:00.000Z');
  });

  it('counts an account once and drops rows with no account, no date or a date ahead of now', () => {
    const stats = buildSourceLinkStats(
      input({
        signups: [
          signup('tt', 'u1', '2026-11-24T10:00:00Z'),
          signup('ig', 'u1', '2026-11-23T10:00:00Z'), // the same account again
          signup('tt', null, '2026-11-24T10:00:00Z'),
          signup('tt', 'u2', null),
          signup('tt', 'u3', 'not a date'),
          signup('tt', 'u4', '2026-12-25T10:00:00Z'),
        ],
      })
    );
    expect(row(stats, 'tt').signups?.all).toBe(1);
    expect(row(stats, 'ig').signups?.all).toBe(0);
    expect(stats.totals.signups?.all).toBe(1);
  });

  it('says what they went on to do: made a rollout, paying', () => {
    const stats = buildSourceLinkStats(
      input({
        signups: [
          signup('tt', 'u1', '2026-11-24T10:00:00Z'),
          signup('tt', 'u2', '2026-11-24T11:00:00Z'),
          signup('ig', 'u3', '2026-11-24T12:00:00Z'),
        ],
        accounts: new Map([['u1', { name: 'Ada', email: 'ada@example.com' }]]),
        rolloutOwnerIds: new Set(['u1', 'u3']),
        planByUserId: new Map([
          ['u1', 'paying'],
          ['u2', 'trial'],
        ]),
      })
    );
    expect(row(stats, 'tt')).toMatchObject({ withRollout: 1, paying: 1 });
    expect(row(stats, 'ig')).toMatchObject({ withRollout: 1, paying: 0 });
    expect(stats.totals).toMatchObject({ withRollout: 2, paying: 1 });
    const ada = stats.recentSignups.find((p) => p.userId === 'u1')!;
    expect(ada).toMatchObject({ name: 'Ada', email: 'ada@example.com', label: 'TikTok', hasRollout: true, plan: 'paying' });
    // No team read for u3: said as "No team", never guessed.
    expect(stats.recentSignups.find((p) => p.userId === 'u3')!.plan).toBe('no_team');
    expect(stats.recentSignups.find((p) => p.userId === 'u2')!.name).toBeNull();
  });

  it('lists the newest first and stops at the cap', () => {
    const many = Array.from({ length: SOURCE_LINK_RECENT_SIGNUPS + 5 }, (_, index) =>
      signup('x', `u${index}`, new Date(Date.parse('2026-11-01T00:00:00Z') + index * 60_000).toISOString())
    );
    const stats = buildSourceLinkStats(input({ signups: many }));
    expect(stats.recentSignups).toHaveLength(SOURCE_LINK_RECENT_SIGNUPS);
    expect(stats.recentSignups[0].userId).toBe(`u${SOURCE_LINK_RECENT_SIGNUPS + 4}`);
    expect(stats.totals.signups?.all).toBe(SOURCE_LINK_RECENT_SIGNUPS + 5);
  });
});

describe('the rate', () => {
  it('is sign-ups for every 100 taps, and nothing when there are no taps', () => {
    const stats = buildSourceLinkStats(
      input({
        taps: [tap('tt', 200)],
        signups: [
          signup('tt', 'u1', '2026-11-24T10:00:00Z'),
          signup('tt', 'u2', '2026-11-24T10:00:00Z'),
          signup('tt', 'u3', '2026-11-24T10:00:00Z'),
          signup('ig', 'u4', '2026-11-24T10:00:00Z'),
        ],
      })
    );
    expect(row(stats, 'tt').ratePercent).toBeCloseTo(1.5);
    // A sign-up with no tap counted (the tap came before counting began).
    expect(row(stats, 'ig').ratePercent).toBeNull();
  });

  it('reads plainly', () => {
    expect(formatSignupRate(null)).toBe('No taps yet');
    expect(formatSignupRate(0)).toBe('0%');
    expect(formatSignupRate(1.5)).toBe('1.5%');
    expect(formatSignupRate(4)).toBe('4%');
    expect(formatSignupRate(4.04)).toBe('4%');
    expect(formatSignupRate(12.4)).toBe('12%');
    expect(formatSignupRate(Number.NaN)).toBe('No taps yet');
  });
});

describe('not tracked', () => {
  it('is null, never zero, when a read failed', () => {
    const noTaps = buildSourceLinkStats(input({ taps: null, signups: [signup('x', 'u1', '2026-11-24T10:00:00Z')] }));
    expect(noTaps.tracked).toBe(true);
    expect(noTaps.totals.taps).toBeNull();
    expect(row(noTaps, 'x').taps).toBeNull();
    expect(row(noTaps, 'x').signups?.all).toBe(1);
    expect(row(noTaps, 'x').ratePercent).toBeNull();

    const nothing = buildSourceLinkStats(input({ taps: null, signups: null }));
    expect(nothing.tracked).toBe(false);
    expect(nothing.totals.taps).toBeNull();
    expect(nothing.totals.signups).toBeNull();
    expect(nothing.rows).toHaveLength(LINKS.length);
    expect(nothing.recentSignups).toEqual([]);
  });
});

describe('where a sign-up stands today', () => {
  it('reads a team state in plain words', () => {
    expect(planFromTeamState('paid')).toBe('paying');
    expect(planFromTeamState('comped')).toBe('free_access');
    expect(planFromTeamState('trial')).toBe('trial');
    expect(planFromTeamState('grace')).toBe('trial');
    expect(planFromTeamState('read_only')).toBe('lapsed');
    expect(planFromTeamState('walled')).toBe('ended');
    expect(planFromTeamState(null)).toBe('no_team');
    expect(planFromTeamState(undefined)).toBe('no_team');
    for (const label of Object.values(SOURCE_LINK_PLAN_LABEL)) expect(label.length).toBeGreaterThan(0);
  });
});
