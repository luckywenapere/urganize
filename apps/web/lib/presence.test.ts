import { describe, expect, it } from 'vitest';
import { lagosDayStart } from './email/onboarding-sequence';
import { ONLINE_WINDOW_MS, PING_INTERVAL_MS, isOnline, parseSurface, presenceDay } from './presence';

const NOW = new Date('2026-10-07T12:00:00.000Z');

describe('presenceDay', () => {
  it('is the Lagos calendar day, which starts at 23:00 UTC the evening before', () => {
    expect(presenceDay(new Date('2026-10-07T22:59:59.000Z'))).toBe('2026-10-07');
    expect(presenceDay(new Date('2026-10-07T23:00:00.000Z'))).toBe('2026-10-08');
    expect(presenceDay(new Date('2026-10-07T00:30:00.000Z'))).toBe('2026-10-07');
  });

  it('agrees with lagosDayStart from the email sequence, across a whole day', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 17) {
      const moment = new Date(Date.parse('2026-12-31T00:00:00.000Z') + minutes * 60 * 1000);
      const fromEmail = new Date(lagosDayStart(moment).getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
      expect(presenceDay(moment), moment.toISOString()).toBe(fromEmail);
    }
  });
});

describe('parseSurface', () => {
  it('keeps a known surface', () => {
    expect(parseSurface('phone_web')).toBe('phone_web');
    expect(parseSurface('ios_app')).toBe('ios_app');
  });

  it('reads anything else as a computer browser', () => {
    expect(parseSurface('toaster')).toBe('desktop_web');
    expect(parseSurface(null)).toBe('desktop_web');
    expect(parseSurface(42)).toBe('desktop_web');
  });
});

describe('isOnline', () => {
  it('counts a ping within five minutes as online', () => {
    expect(isOnline(new Date(NOW.getTime() - ONLINE_WINDOW_MS).toISOString(), NOW)).toBe(true);
    expect(isOnline(new Date(NOW.getTime() - ONLINE_WINDOW_MS - 1000).toISOString(), NOW)).toBe(false);
  });

  it('survives one missed ping, so a slow network does not flicker someone offline', () => {
    expect(ONLINE_WINDOW_MS).toBeGreaterThan(2 * PING_INTERVAL_MS);
  });

  it('treats a time ahead of our clock as now, not as forever', () => {
    expect(isOnline('2026-10-07T12:03:00.000Z', NOW)).toBe(true);
  });

  it('is false for nothing or nonsense', () => {
    expect(isOnline(null, NOW)).toBe(false);
    expect(isOnline('not a date', NOW)).toBe(false);
  });
});
