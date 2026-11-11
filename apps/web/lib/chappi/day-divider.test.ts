import { describe, expect, it } from 'vitest';
import { dayLabel, dayLinesFor } from './day-divider';

const NOW = new Date(2026, 10, 11, 9, 0); // Wed 11 Nov 2026, local time

describe('dayLabel', () => {
  it('says Today and Yesterday, then the date', () => {
    expect(dayLabel(new Date(2026, 10, 11, 7, 30).toISOString(), NOW)).toBe('Today');
    expect(dayLabel(new Date(2026, 10, 10, 22, 0).toISOString(), NOW)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 10, 3, 12, 0).toISOString(), NOW)).toBe('Tue 3 Nov');
    expect(dayLabel(new Date(2025, 11, 31, 12, 0).toISOString(), NOW)).toBe('Wed 31 Dec 2025');
    expect(dayLabel('nope', NOW)).toBe('');
  });
});

describe('dayLinesFor', () => {
  it('draws a line above the first message of each day only', () => {
    const lines = dayLinesFor(
      [
        {},
        { at: new Date(2026, 10, 10, 9).toISOString() },
        { at: new Date(2026, 10, 10, 10).toISOString() },
        {},
        { at: new Date(2026, 10, 11, 8).toISOString() },
      ],
      NOW
    );
    expect(lines).toEqual([null, 'Yesterday', null, null, 'Today']);
  });
});
