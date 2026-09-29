import { describe, expect, it } from 'vitest';
import {
  CHAPPI_SPEAKS_WEEKDAY_LINES,
  CHAPPI_SPEAKS_RELEASE_SOON_LINE,
  CHAPPI_SPEAKS_RELEASE_TODAY_LINE,
  pickChappiSpeaks,
} from './chappi-speaks';
import { CHAPPI_SPEAKS_RELEASE_WINDOW_DAYS } from './config';

// 2026-09-28 is a Monday. Local time on purpose: Home reads the device clock.
function day(offset: number, hour = 10): Date {
  return new Date(2026, 8, 28 + offset, hour, 0, 0);
}

function releaseIn(now: Date, days: number): { releaseDate: string } {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return { releaseDate: date.toISOString() };
}

describe('pickChappiSpeaks, no release coming', () => {
  it.each([
    [0, 'Monday'],
    [1, 'Tuesday'],
    [2, 'Wednesday'],
    [3, 'Thursday'],
    [4, 'Friday'],
    [5, 'Saturday'],
    [6, 'Sunday'],
  ])('offset %i (%s) reads its own weekday line', (offset) => {
    const now = day(offset);
    const picked = pickChappiSpeaks({ now, releases: [] });
    expect(picked.occasion).toBe('weekday');
    expect(picked.text).toBe(CHAPPI_SPEAKS_WEEKDAY_LINES[now.getDay()]);
  });

  it('has a distinct line for every day of the week', () => {
    expect(new Set(CHAPPI_SPEAKS_WEEKDAY_LINES).size).toBe(7);
  });

  it('keeps the same line all day and changes it at midnight', () => {
    const early = pickChappiSpeaks({ now: day(0, 0), releases: [] });
    const late = pickChappiSpeaks({ now: day(0, 23), releases: [] });
    const next = pickChappiSpeaks({ now: day(1, 0), releases: [] });
    expect(early.text).toBe(late.text);
    expect(next.text).not.toBe(early.text);
  });

  it('says release day on Friday', () => {
    expect(pickChappiSpeaks({ now: day(4), releases: [] }).text).toMatch(/release day/i);
  });

  it('ignores a release that is far away', () => {
    const now = day(4);
    const far = releaseIn(now, CHAPPI_SPEAKS_RELEASE_WINDOW_DAYS + 1);
    expect(pickChappiSpeaks({ now, releases: [far] }).occasion).toBe('weekday');
  });

  it('ignores a release that already passed', () => {
    const now = day(4);
    expect(pickChappiSpeaks({ now, releases: [releaseIn(now, -1)] }).occasion).toBe('weekday');
  });

  it('ignores a release with no date or an unreadable one', () => {
    const now = day(4);
    expect(
      pickChappiSpeaks({ now, releases: [{ releaseDate: null }, { releaseDate: 'not a date' }] }).occasion
    ).toBe('weekday');
  });
});

describe('pickChappiSpeaks, a release is coming', () => {
  it('drops the Friday line for someone whose release is this week', () => {
    const now = day(4);
    const picked = pickChappiSpeaks({ now, releases: [releaseIn(now, 3)] });
    expect(picked.occasion).toBe('release_soon');
    expect(picked.text).toBe(CHAPPI_SPEAKS_RELEASE_SOON_LINE);
  });

  it('counts the last day of the window and not the day after', () => {
    const now = day(1);
    const edge = pickChappiSpeaks({ now, releases: [releaseIn(now, CHAPPI_SPEAKS_RELEASE_WINDOW_DAYS)] });
    expect(edge.occasion).toBe('release_soon');
  });

  it('says so when the release is today', () => {
    const now = day(4);
    const picked = pickChappiSpeaks({ now, releases: [releaseIn(now, 0)] });
    expect(picked.occasion).toBe('release_today');
    expect(picked.text).toBe(CHAPPI_SPEAKS_RELEASE_TODAY_LINE);
  });

  it('prefers today over a later release', () => {
    const now = day(2);
    const picked = pickChappiSpeaks({ now, releases: [releaseIn(now, 6), releaseIn(now, 0)] });
    expect(picked.occasion).toBe('release_today');
  });

  it('compares device-local days, so a release late tonight is still today', () => {
    const now = day(2, 23);
    const tonight = { releaseDate: new Date(2026, 8, 30, 23, 30).toISOString() };
    expect(pickChappiSpeaks({ now, releases: [tonight] }).occasion).toBe('release_today');
  });
});

describe('the copy', () => {
  const all = [
    ...CHAPPI_SPEAKS_WEEKDAY_LINES,
    CHAPPI_SPEAKS_RELEASE_SOON_LINE,
    CHAPPI_SPEAKS_RELEASE_TODAY_LINE,
  ];

  it('has seven weekday lines, Sunday first to match Date.getDay()', () => {
    expect(CHAPPI_SPEAKS_WEEKDAY_LINES).toHaveLength(7);
    expect(CHAPPI_SPEAKS_WEEKDAY_LINES[0]).toMatch(/new week/i);
  });

  it('keeps each line short enough to read in one glance', () => {
    for (const line of all) expect(line.length).toBeLessThanOrEqual(140);
  });
});
