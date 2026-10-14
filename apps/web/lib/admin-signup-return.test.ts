import { describe, expect, it } from 'vitest';
import {
  RETURN_WEEKS,
  SIGNUP_COHORT_COUNT,
  lagosDay,
  lagosWeekStart,
  weeklyReturnBySignupWeek,
  type SignupUser,
} from './admin-signup-return';
import { formatReturnCell } from './admin-signup-return-format';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;
const at = (iso: string) => Date.parse(iso);

// Wednesday 14 October 2026, noon in Lagos. Its Lagos week starts Monday 12 Oct.
const NOW = new Date('2026-10-14T12:00:00+01:00');

describe('lagosWeekStart', () => {
  it('starts weeks on Monday midnight in Lagos', () => {
    expect(lagosWeekStart(at('2026-10-14T12:00:00+01:00'))).toBe(at('2026-10-12T00:00:00+01:00'));
    expect(lagosDay(lagosWeekStart(at('2026-10-14T12:00:00+01:00')))).toBe('2026-10-12');
  });

  it('puts Monday 00:30 in Lagos (Sunday 23:30 UTC) in the new week', () => {
    // A UTC week would file this on the Monday before.
    expect(lagosDay(lagosWeekStart(at('2026-10-11T23:30:00Z')))).toBe('2026-10-12');
  });

  it('keeps Sunday 23:59 in Lagos in the week it ends', () => {
    expect(lagosDay(lagosWeekStart(at('2026-10-18T23:59:00+01:00')))).toBe('2026-10-12');
  });
});

describe('weeklyReturnBySignupWeek', () => {
  it('shows the last 8 signup weeks newest first, the current week included, gaps kept', () => {
    const table = weeklyReturnBySignupWeek([], new Map(), NOW);
    expect(table.cohorts).toHaveLength(SIGNUP_COHORT_COUNT);
    expect(table.cohorts.map((c) => c.weekStart)).toEqual([
      '2026-10-12',
      '2026-10-05',
      '2026-09-28',
      '2026-09-21',
      '2026-09-14',
      '2026-09-07',
      '2026-08-31',
      '2026-08-24',
    ]);
    expect(table.cohorts.every((c) => c.size === 0)).toBe(true);
    expect(table.anyBeforeTaskEdits).toBe(false);
  });

  it('counts people by when their account was made, once each, and skips bad or future dates', () => {
    const users: SignupUser[] = [
      { userId: 'a', signedUpAt: '2026-10-12T09:00:00+01:00' },
      { userId: 'a', signedUpAt: '2026-10-12T09:00:00+01:00' },
      { userId: 'b', signedUpAt: '2026-10-11T23:30:00Z' }, // Monday 00:30 Lagos
      { userId: 'c', signedUpAt: null },
      { userId: 'd', signedUpAt: 'not a date' },
      { userId: 'e', signedUpAt: '2026-10-20T09:00:00+01:00' },
      { userId: 'f', signedUpAt: '2026-01-05T09:00:00+01:00' }, // older than 8 weeks
    ];
    const table = weeklyReturnBySignupWeek(users, new Map(), NOW);
    expect(table.cohorts[0].size).toBe(2);
    expect(table.cohorts.reduce((sum, c) => sum + c.size, 0)).toBe(2);
  });

  it('measures week N from each person’s own signup: days 7–13 is week 1, 28–34 is week 4', () => {
    // Cohort week of Mon 24 Aug 2026: every week after signup is long over by NOW.
    const signup = at('2026-08-26T10:00:00+01:00');
    const users: SignupUser[] = [
      { userId: 'w1', signedUpAt: new Date(signup).toISOString() },
      { userId: 'w2', signedUpAt: new Date(signup).toISOString() },
      { userId: 'w4', signedUpAt: new Date(signup).toISOString() },
      { userId: 'none', signedUpAt: new Date(signup).toISOString() },
    ];
    const activity = new Map<string, number[]>([
      ['w1', [signup + 7 * DAY]], // first instant of week 1
      ['w2', [signup + 14 * DAY - 1, signup + 14 * DAY]], // last instant of week 1, first of week 2
      ['w4', [signup + 35 * DAY - 1]], // last instant of week 4
      ['none', [signup + 1000, signup + 7 * DAY - 1, signup + 35 * DAY]], // signup week and week 5 only
    ]);
    const cohort = weeklyReturnBySignupWeek(users, activity, NOW).cohorts.find((c) => c.weekStart === '2026-08-24');
    expect(cohort?.size).toBe(4);
    expect(cohort?.weeks).toHaveLength(RETURN_WEEKS);
    expect(cohort?.weeks.map((w) => w?.returned)).toEqual([2, 1, 0, 1]);
    expect(cohort?.weeks[0]).toEqual({ returned: 2, size: 4, rate: 0.5 });
  });

  it('leaves a week blank until it is over for everyone in the cohort', () => {
    // Cohort of Mon 21 Sep: ends Mon 28 Sep. Week n is complete at 28 Sep + (n+1) weeks.
    // Week 1 done 12 Oct, week 2 done 19 Oct: on 14 Oct only week 1 is shown.
    const users: SignupUser[] = [{ userId: 'x', signedUpAt: '2026-09-21T08:00:00+01:00' }];
    const activity = new Map([['x', [at('2026-09-29T08:00:00+01:00')]]]);
    const table = weeklyReturnBySignupWeek(users, activity, NOW);
    const cohort = table.cohorts.find((c) => c.weekStart === '2026-09-21');
    expect(cohort?.weeks[0]).toEqual({ returned: 1, size: 1, rate: 1 });
    expect(cohort?.weeks.slice(1)).toEqual([null, null, null]);

    // The current week and last week have no finished week yet.
    expect(table.cohorts[0].weeks).toEqual([null, null, null, null]);
    expect(table.cohorts[1].weeks).toEqual([null, null, null, null]);

    // Exactly at the boundary the cell appears.
    const atBoundary = weeklyReturnBySignupWeek(users, activity, new Date('2026-10-12T00:00:00+01:00'));
    expect(atBoundary.cohorts.find((c) => c.weekStart === '2026-09-21')?.weeks[0]).not.toBeNull();
    const justBefore = weeklyReturnBySignupWeek(users, activity, new Date(at('2026-10-12T00:00:00+01:00') - 1));
    expect(justBefore.cohorts.find((c) => c.weekStart === '2026-09-21')?.weeks[0]).toBeNull();
  });

  it('gives an empty finished week a zero-size cell, not a blank', () => {
    const cohort = weeklyReturnBySignupWeek([], new Map(), NOW).cohorts.find((c) => c.weekStart === '2026-08-24');
    expect(cohort?.weeks[0]).toEqual({ returned: 0, size: 0, rate: null });
  });

  it('marks cohorts whose week 1 began before task edits were recorded (2 Oct 2026)', () => {
    const users: SignupUser[] = [
      { userId: 'early', signedUpAt: '2026-09-21T08:00:00+01:00' }, // week 1 from 28 Sep
      { userId: 'late', signedUpAt: '2026-09-28T08:00:00+01:00' }, // cohort week 1 from 5 Oct
    ];
    const table = weeklyReturnBySignupWeek(users, new Map(), NOW);
    expect(table.cohorts.find((c) => c.weekStart === '2026-09-21')?.beforeTaskEdits).toBe(true);
    expect(table.cohorts.find((c) => c.weekStart === '2026-09-28')?.beforeTaskEdits).toBe(false);
    expect(table.anyBeforeTaskEdits).toBe(true);
  });

  it('does not change the activity it is given', () => {
    const activity = new Map([['x', [3, 1, 2]]]);
    weeklyReturnBySignupWeek([{ userId: 'x', signedUpAt: '2026-08-26T10:00:00+01:00' }], activity, NOW);
    expect(activity.get('x')).toEqual([3, 1, 2]);
  });

  it('takes the cohort count', () => {
    expect(weeklyReturnBySignupWeek([], new Map(), NOW, 3).cohorts).toHaveLength(3);
  });

  it('uses whole weeks: a week is exactly 7 days', () => {
    expect(lagosWeekStart(at('2026-10-14T12:00:00+01:00')) - lagosWeekStart(at('2026-10-07T12:00:00+01:00'))).toBe(WEEK);
  });
});

describe('formatReturnCell', () => {
  it('shows counts beside the percentage', () => {
    expect(formatReturnCell({ returned: 3, size: 7, rate: 3 / 7 })).toBe('3/7 · 43%');
    expect(formatReturnCell({ returned: 0, size: 2, rate: 0 })).toBe('0/2 · 0%');
  });

  it('leaves an unfinished week blank and dashes an empty cohort', () => {
    expect(formatReturnCell(null)).toBe('');
    expect(formatReturnCell({ returned: 0, size: 0, rate: null })).toBe('—');
  });
});
