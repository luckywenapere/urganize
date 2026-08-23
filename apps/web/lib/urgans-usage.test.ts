import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANCHOR_DAY,
  readAnchorDay,
  resolveUsageWindow,
  usageWindowStartIso,
} from './urgans-usage';

const utc = (iso: string) => new Date(iso);
const day = (d: Date) => d.toISOString().slice(0, 10);

describe('readAnchorDay', () => {
  it('takes the day-of-month off the anchor', () => {
    expect(readAnchorDay('2026-03-12T14:30:00.000Z')).toBe(12);
    expect(readAnchorDay('2027-01-31T00:00:00.000Z')).toBe(31);
  });

  it('falls back to the 1st when there is no usable anchor', () => {
    for (const value of [null, undefined, '', 'not a date']) {
      expect(readAnchorDay(value), String(value)).toBe(DEFAULT_ANCHOR_DAY);
    }
    expect(DEFAULT_ANCHOR_DAY).toBe(1);
  });
});

describe('resolveUsageWindow', () => {
  const anchor = '2026-01-12T09:00:00.000Z'; // billed on the 12th

  it('starts on this month anchor once the day has arrived', () => {
    const w = resolveUsageWindow({ now: utc('2026-03-12T00:00:00.000Z'), anchorIso: anchor });
    expect(day(w.start)).toBe('2026-03-12');
    expect(day(w.end)).toBe('2026-04-12');
  });

  it('steps back a month when the anchor day has not arrived yet', () => {
    const w = resolveUsageWindow({ now: utc('2026-03-11T23:59:59.000Z'), anchorIso: anchor });
    expect(day(w.start)).toBe('2026-02-12');
    expect(day(w.end)).toBe('2026-03-12');
  });

  it('treats the boundary instant as the new window, not the old one', () => {
    const before = resolveUsageWindow({
      now: utc('2026-03-11T23:59:59.999Z'),
      anchorIso: anchor,
    });
    const at = resolveUsageWindow({ now: utc('2026-03-12T00:00:00.000Z'), anchorIso: anchor });
    expect(day(before.start)).toBe('2026-02-12');
    expect(day(at.start)).toBe('2026-03-12');
  });

  it('crosses a year boundary', () => {
    const w = resolveUsageWindow({ now: utc('2026-01-05T00:00:00.000Z'), anchorIso: anchor });
    expect(day(w.start)).toBe('2025-12-12');
    expect(day(w.end)).toBe('2026-01-12');
  });

  // The reason the window is built forwards instead of derived by subtracting an
  // interval: a team billed on the 31st has no 31st in February.
  it('clamps a month-end anchor to the last day of a short month', () => {
    const endOfMonth = '2026-01-31T00:00:00.000Z';
    const feb = resolveUsageWindow({ now: utc('2026-02-28T12:00:00.000Z'), anchorIso: endOfMonth });
    expect(day(feb.start)).toBe('2026-02-28');
    expect(day(feb.end)).toBe('2026-03-31');
  });

  it('clamps on a leap February', () => {
    const endOfMonth = '2024-01-31T00:00:00.000Z';
    const feb = resolveUsageWindow({ now: utc('2024-02-29T12:00:00.000Z'), anchorIso: endOfMonth });
    expect(day(feb.start)).toBe('2024-02-29');
  });

  it('handles a 30-day month for a 31st anchor', () => {
    const w = resolveUsageWindow({ now: utc('2026-04-30T06:00:00.000Z'), anchorIso: '2026-01-31T00:00:00.000Z' });
    expect(day(w.start)).toBe('2026-04-30');
    expect(day(w.end)).toBe('2026-05-31');
  });

  // THE ONE THAT MATTERS MOST. Deriving a period by repeatedly subtracting an
  // interval from a clamped date drifts: Jan 31 + 1mo = Mar 2/3, and the error
  // compounds. Building forwards from `now` cannot, because nothing is carried.
  it('does not drift across twelve consecutive months', () => {
    const anchorIso = '2026-01-31T00:00:00.000Z';
    for (let month = 0; month < 12; month += 1) {
      // Sample mid-month, so the window is unambiguous.
      const now = new Date(Date.UTC(2026, month, 15));
      const w = resolveUsageWindow({ now, anchorIso });
      // The start is always the clamped anchor of the PREVIOUS month, because
      // the 31st has not arrived by the 15th.
      const expectedMonth = month === 0 ? 11 : month - 1;
      const expectedYear = month === 0 ? 2025 : 2026;
      expect(w.start.getUTCFullYear(), `month ${month}`).toBe(expectedYear);
      expect(w.start.getUTCMonth(), `month ${month}`).toBe(expectedMonth);
      // And the window always contains `now`.
      expect(w.start.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(w.end.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it('always produces a window containing now, for every anchor day', () => {
    for (let anchorDay = 1; anchorDay <= 31; anchorDay += 1) {
      const anchorIso = new Date(Date.UTC(2026, 0, anchorDay)).toISOString();
      for (const sample of ['2026-02-01', '2026-02-14', '2026-02-28', '2026-07-31']) {
        const now = utc(`${sample}T12:00:00.000Z`);
        const w = resolveUsageWindow({ now, anchorIso });
        expect(w.start.getTime(), `${anchorDay}/${sample}`).toBeLessThanOrEqual(now.getTime());
        expect(w.end.getTime(), `${anchorDay}/${sample}`).toBeGreaterThan(now.getTime());
      }
    }
  });

  it('defaults to calendar months with no anchor', () => {
    const w = resolveUsageWindow({ now: utc('2026-05-17T00:00:00.000Z') });
    expect(day(w.start)).toBe('2026-05-01');
    expect(day(w.end)).toBe('2026-06-01');
  });

  it('exposes the start as an ISO string for the count query', () => {
    expect(usageWindowStartIso({ now: utc('2026-05-17T00:00:00.000Z') })).toBe(
      '2026-05-01T00:00:00.000Z'
    );
  });
});
