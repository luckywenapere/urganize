import { describe, expect, it } from 'vitest';
import { formatCount, formatMonth, formatReplyRate, formatWeekCompare } from './directory-growth-format';

describe('directory growth wording', () => {
  it('reads a source that could not be read as Not tracked, never as zero', () => {
    expect(formatCount(null)).toBe('Not tracked');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(1234)).toBe('1,234');
  });

  it('reads a reply rate as a whole percent, and a missing one as No answers yet', () => {
    expect(formatReplyRate(0.4)).toBe('40%');
    expect(formatReplyRate(0)).toBe('0%');
    expect(formatReplyRate(null)).toBe('No answers yet');
  });

  it('compares this week with last week in plain words', () => {
    expect(formatWeekCompare({ current: 3, previous: 1, delta: 2, pct: 2 })).toBe('Up 2 from 1 last week');
    expect(formatWeekCompare({ current: 1, previous: 3, delta: -2, pct: -0.67 })).toBe('Down 2 from 3 last week');
    expect(formatWeekCompare({ current: 2, previous: 2, delta: 0, pct: 0 })).toBe('Same as last week');
    expect(formatWeekCompare(null)).toBeNull();
  });

  it('writes a month as a short name and year', () => {
    expect(formatMonth('2026-10')).toBe('Oct 2026');
    expect(formatMonth('nonsense')).toBe('nonsense');
  });
});
