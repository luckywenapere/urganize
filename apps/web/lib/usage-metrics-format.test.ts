import { describe, expect, it } from 'vitest';
import { formatClock, formatDate, formatShare, formatUsd, people, timeAgo } from './usage-metrics-format';

const NOW = new Date('2026-10-07T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MINUTE = 60 * 1000;

describe('timeAgo', () => {
  it('reads like a person would say it', () => {
    expect(timeAgo(ago(20 * 1000), NOW)).toBe('just now');
    expect(timeAgo(ago(4 * MINUTE), NOW)).toBe('4 min ago');
    expect(timeAgo(ago(3 * 60 * MINUTE), NOW)).toBe('3 h ago');
    expect(timeAgo(ago(30 * 60 * MINUTE), NOW)).toBe('yesterday');
    expect(timeAgo(ago(6 * 24 * 60 * MINUTE), NOW)).toBe('6 days ago');
    expect(timeAgo(ago(20 * 24 * 60 * MINUTE), NOW)).toBe('17 Sep');
  });

  it('never says a time in the future', () => {
    expect(timeAgo('2026-10-07T12:05:00.000Z', NOW)).toBe('just now');
  });

  it('says never for nothing', () => {
    expect(timeAgo(null, NOW)).toBe('Never');
    expect(timeAgo('nonsense', NOW)).toBe('Never');
  });
});

describe('formatDate and formatClock', () => {
  it('uses Lagos time', () => {
    // 23:30 UTC is already the next day in Lagos.
    expect(formatDate('2026-10-06T23:30:00.000Z', NOW)).toBe('7 Oct');
    expect(formatClock('2026-10-07T12:05:00.000Z')).toBe('13:05');
  });

  it('adds the year only when it is not this year', () => {
    expect(formatDate('2025-12-01T12:00:00.000Z', NOW)).toBe('1 Dec 2025');
  });
});

describe('numbers', () => {
  it('formats shares, money and people', () => {
    expect(formatShare(0.456)).toBe('46%');
    expect(formatShare(null)).toBe('No data');
    expect(formatUsd(2.5)).toBe('$2.50');
    expect(formatUsd(1234.4)).toBe('$1,234');
    expect(formatUsd(null)).toBe('Not tracked');
    expect(people(1)).toBe('1 person');
    expect(people(3)).toBe('3 people');
  });
});
