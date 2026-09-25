import { describe, expect, it } from 'vitest';
import { summarizeWaitlistWeeks, type WaitlistWeek } from './waitlist-weeks';

/**
 * The Growth page's waitlist numbers. Each weekly point is a running total at
 * the END of its week, so the first week's own sign-ups can only be found by
 * knowing how many people were on the waitlist before that week began. The
 * "Last 12 weeks" tile and the table's first "Change" both depend on it.
 */

const week = (weekLabel: string, totalUsers: number): WaitlistWeek => ({ weekLabel, totalUsers });

// Twelve weeks, 101 at the end of the first and 135 at the end of the last.
const twelveWeeks = [101, 103, 108, 110, 115, 118, 120, 124, 126, 130, 133, 135].map((total, index) =>
  week(`2026-W${String(28 + index).padStart(2, '0')}`, total)
);

describe('summarizeWaitlistWeeks', () => {
  it('counts growth over all 12 weeks, not 11', () => {
    // 95 were on the waitlist before the first week began. Taking the first
    // week's END total instead (101) would drop that week's 6 sign-ups.
    expect(summarizeWaitlistWeeks(twelveWeeks, 95).growth).toBe(40);
  });

  it('gives the first week its own sign-ups', () => {
    const { weeks } = summarizeWaitlistWeeks(twelveWeeks, 95);
    expect(weeks[0].change).toBe(6);
    expect(weeks[1].change).toBe(2);
    expect(weeks.at(-1)?.change).toBe(2);
  });

  it('makes the weekly changes add up to the growth', () => {
    const summary = summarizeWaitlistWeeks(twelveWeeks, 95);
    const sum = summary.weeks.reduce((total, row) => total + row.change, 0);
    expect(sum).toBe(summary.growth);
  });

  it('keeps each week’s label and total on its row', () => {
    const { weeks } = summarizeWaitlistWeeks(twelveWeeks, 95);
    expect(weeks[0]).toMatchObject({ weekLabel: '2026-W28', totalUsers: 101 });
    expect(weeks).toHaveLength(12);
  });

  it('shows a drop as a negative change', () => {
    // Rows can be removed from the waitlist, so a running total can fall.
    const summary = summarizeWaitlistWeeks([week('2026-W38', 10), week('2026-W39', 8)], 5);
    expect(summary.weeks.map((row) => row.change)).toEqual([5, -2]);
    expect(summary.growth).toBe(3);
  });

  it('has no growth and no rows without weeks', () => {
    expect(summarizeWaitlistWeeks([], 0)).toEqual({ growth: 0, weeks: [] });
    expect(summarizeWaitlistWeeks([], 40)).toEqual({ growth: 0, weeks: [] });
  });

  it('falls back to the first week’s total when the earlier count is unknown', () => {
    // Never guess a number: with no pre-window count the first week shows no
    // change, which is what the page showed before it had one.
    const summary = summarizeWaitlistWeeks(twelveWeeks, Number.NaN);
    expect(summary.weeks[0].change).toBe(0);
    expect(summary.growth).toBe(34);
  });
});
