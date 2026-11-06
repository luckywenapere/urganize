import { describe, expect, it } from 'vitest';
import { isOutNowEmailDay, isQuietLookup } from './rules';

// 2026-11-06 10:00 Lagos.
const NOW = Date.parse('2026-11-06T09:00:00Z');

describe('isQuietLookup', () => {
  it('is quiet on release day and the day after', () => {
    expect(isQuietLookup('2026-11-06', NOW)).toBe(true);
    expect(isQuietLookup('2026-11-05', NOW)).toBe(true);
  });
  it('stops being quiet two days after, and before release day', () => {
    expect(isQuietLookup('2026-11-04', NOW)).toBe(false);
    expect(isQuietLookup('2026-11-07', NOW)).toBe(false);
    expect(isQuietLookup(null, NOW)).toBe(false);
  });
});

describe('isOutNowEmailDay', () => {
  it('emails on release day and the day after only', () => {
    expect(isOutNowEmailDay('2026-11-06', NOW)).toBe(true);
    expect(isOutNowEmailDay('2026-11-05', NOW)).toBe(true);
    expect(isOutNowEmailDay('2026-10-01', NOW)).toBe(false);
    expect(isOutNowEmailDay('2026-11-07', NOW)).toBe(false);
  });
});
