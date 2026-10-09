import { describe, expect, it } from 'vitest';
import { summarizeDirectory, summarizeWorkRequests } from './directory-admin-summary';

const supply = (over: Partial<Parameters<typeof summarizeDirectory>[0]> = {}) => ({
  profiles: [],
  records: [],
  demand: [],
  ...over,
});

describe('summarizeDirectory', () => {
  it('counts listed people per claimed role', () => {
    const summary = summarizeDirectory(
      supply({ profiles: [{ roles: ['pr', 'graphic_designer'] }, { roles: ['pr'] }] })
    );
    expect(summary.byRole.find((row) => row.role === 'pr')?.listed).toBe(2);
    expect(summary.byRole.find((row) => row.role === 'graphic_designer')?.listed).toBe(1);
  });

  it('counts PEOPLE with a record, not records', () => {
    // Somebody who delivered artwork on four releases is one designer, not
    // four. Supply is how many people you can call.
    const summary = summarizeDirectory(
      supply({
        records: [
          { userId: 'u1', role: 'graphic_designer' },
          { userId: 'u1', role: 'graphic_designer' },
          { userId: 'u2', role: 'graphic_designer' },
        ],
      })
    );
    const row = summary.byRole.find((entry) => entry.role === 'graphic_designer');
    expect(row?.delivered).toBe(2);
  });

  it('splits demand into wanted and unmet', () => {
    const summary = summarizeDirectory(
      supply({
        demand: [
          { role: 'pr', matched: false, source: 'search' },
          { role: 'pr', matched: true, source: 'search' },
          { role: 'pr', matched: false, source: 'role_gap' },
        ],
      })
    );
    const row = summary.byRole.find((entry) => entry.role === 'pr');
    expect(row?.wanted).toBe(3);
    expect(row?.unmet).toBe(2);
  });

  it('keeps plan-seeded demand apart from typed demand', () => {
    // The role gaps panel is the retention mechanic. Whether it actually drives
    // search is a different question from whether managers search at all, and
    // folding the two together makes it unanswerable.
    const summary = summarizeDirectory(
      supply({
        demand: [
          { role: 'pr', matched: false, source: 'role_gap' },
          { role: 'pr', matched: false, source: 'search' },
          { role: 'pr', matched: false, source: 'search' },
        ],
      })
    );
    const row = summary.byRole.find((entry) => entry.role === 'pr');
    expect(row?.fromRoleGaps).toBe(1);
  });

  it('ranks the recruiting list by unmet demand', () => {
    const summary = summarizeDirectory(
      supply({
        demand: [
          { role: 'pr', matched: false, source: 'search' },
          { role: 'videographer', matched: false, source: 'search' },
          { role: 'videographer', matched: false, source: 'search' },
        ],
      })
    );
    expect(summary.recruit.map((row) => row.role)).toEqual(['videographer', 'pr']);
  });

  it('leaves a role with nobody to call on the recruiting list even when demand is even', () => {
    const summary = summarizeDirectory(
      supply({
        records: [{ userId: 'u1', role: 'pr' }],
        demand: [
          { role: 'pr', matched: false, source: 'search' },
          { role: 'videographer', matched: false, source: 'search' },
        ],
      })
    );
    // Both were wanted once and neither matched. The one with nobody who has
    // ever delivered it is the one to recruit for.
    expect(summary.recruit[0].role).toBe('videographer');
  });

  it('recruits for nothing nobody asked for', () => {
    // A role with no demand is not a gap, it is a role nobody needs. Listing
    // every empty role would bury the two that matter.
    const summary = summarizeDirectory(supply({ profiles: [{ roles: ['pr'] }] }));
    expect(summary.recruit).toEqual([]);
  });

  it('omits a role with no supply and no demand from the table entirely', () => {
    const summary = summarizeDirectory(supply({ profiles: [{ roles: ['pr'] }] }));
    expect(summary.byRole.map((row) => row.role)).toEqual(['pr']);
  });

  it('ignores a role outside the vocabulary rather than inventing a row', () => {
    const summary = summarizeDirectory(
      supply({ profiles: [{ roles: ['wizard'] }], records: [{ userId: 'u1', role: 'wizard' }] })
    );
    expect(summary.byRole).toEqual([]);
  });

  it('totals what it counted', () => {
    const summary = summarizeDirectory(
      supply({
        profiles: [{ roles: ['pr'] }, { roles: [] }],
        records: [{ userId: 'u1', role: 'pr' }],
        demand: [{ role: 'pr', matched: false, source: 'search' }],
      })
    );
    expect(summary.totals).toEqual({ listed: 2, withARecord: 1, wanted: 1, unmet: 1 });
  });
});

describe('summarizeWorkRequests', () => {
  // A Wednesday, so weeks are easy to place: Monday 5 October 2026.
  const now = Date.parse('2026-10-07T12:00:00Z');
  const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

  it('counts what happened to every request', () => {
    const summary = summarizeWorkRequests(
      [
        { status: 'interested', createdAt: daysAgo(1) },
        { status: 'passed', createdAt: daysAgo(2) },
        { status: 'expired', createdAt: daysAgo(12) },
        { status: 'new', createdAt: daysAgo(1) },
      ],
      now
    );
    expect(summary.totals).toMatchObject({
      sent: 4,
      interested: 1,
      passed: 1,
      closed: 1,
      waiting: 1,
    });
  });

  it('reads a request still marked waiting after seven days as closed', () => {
    // Before the daily sweep has run, or before the migration that allows the
    // stored word, the page must still be right.
    const summary = summarizeWorkRequests([{ status: 'new', createdAt: daysAgo(8) }], now);
    expect(summary.totals.closed).toBe(1);
    expect(summary.totals.waiting).toBe(0);
  });

  it('keeps a request of exactly seven days open', () => {
    const summary = summarizeWorkRequests([{ status: 'new', createdAt: daysAgo(7) }], now);
    expect(summary.totals.waiting).toBe(1);
    expect(summary.totals.closed).toBe(0);
  });

  it('leaves a request that is still waiting out of the reply rate', () => {
    // One yes and one request sent an hour ago: the rate is one of one, not one
    // of two, because the second has not had its chance.
    const summary = summarizeWorkRequests(
      [
        { status: 'interested', createdAt: daysAgo(3) },
        { status: 'new', createdAt: daysAgo(0) },
      ],
      now
    );
    expect(summary.totals.replyRate).toBe(1);
  });

  it('counts a closed request against the reply rate and a pass for it', () => {
    const summary = summarizeWorkRequests(
      [
        { status: 'interested', createdAt: daysAgo(3) },
        { status: 'passed', createdAt: daysAgo(3) },
        { status: 'expired', createdAt: daysAgo(10) },
        { status: 'expired', createdAt: daysAgo(10) },
      ],
      now
    );
    // A pass is an answer: they replied. Two replies of four known outcomes.
    expect(summary.totals.replyRate).toBe(0.5);
  });

  it('answers null, not zero, when nothing has a known outcome yet', () => {
    expect(summarizeWorkRequests([], now).totals.replyRate).toBeNull();
    expect(
      summarizeWorkRequests([{ status: 'new', createdAt: daysAgo(0) }], now).totals.replyRate
    ).toBeNull();
  });

  it('groups by the Monday of the week, newest first', () => {
    const summary = summarizeWorkRequests(
      [
        { status: 'interested', createdAt: '2026-10-06T09:00:00Z' }, // Tuesday
        { status: 'passed', createdAt: '2026-10-05T00:00:00Z' }, // Monday itself
        { status: 'expired', createdAt: '2026-10-04T23:00:00Z' }, // Sunday, week before
      ],
      now
    );
    expect(summary.weeks.map((week) => week.weekStart)).toEqual(['2026-10-05', '2026-09-28']);
    expect(summary.weeks[0]).toMatchObject({ sent: 2, interested: 1, passed: 1 });
    expect(summary.weeks[1]).toMatchObject({ sent: 1, closed: 1 });
  });

  it('counts a row with no readable date in the totals and leaves it out of the weeks', () => {
    const summary = summarizeWorkRequests([{ status: 'interested', createdAt: 'not a date' }], now);
    expect(summary.totals.sent).toBe(1);
    expect(summary.weeks).toEqual([]);
  });
});
