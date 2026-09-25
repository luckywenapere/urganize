import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_MONTHS_WINDOW,
  buildAccountMonths,
  loadAccountMonths,
  trailingMonthWindows,
  type CountRange,
  type MonthWindow,
} from './account-months';

/**
 * The Growth page's monthly account counts. Two properties matter most:
 * the month boundaries are UTC first-of-month instants that touch end to end
 * (so every account lands in exactly one bar), and the running totals are
 * worked BACKWARDS from the exact total, so the table's last row always
 * agrees with the "Total accounts" tile.
 */

const keys = (windows: MonthWindow[]) => windows.map((window) => window.monthKey);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('trailingMonthWindows', () => {
  it('returns the last 12 months, oldest first, ending with the current one', () => {
    const windows = trailingMonthWindows(new Date('2026-09-25T10:00:00Z'));
    expect(windows).toHaveLength(ACCOUNT_MONTHS_WINDOW);
    expect(windows[0].monthKey).toBe('2025-10');
    expect(windows[11].monthKey).toBe('2026-09');
    expect(windows.map((window) => window.isCurrent)).toEqual([
      ...Array.from({ length: 11 }, () => false),
      true,
    ]);
  });

  it('labels months for the table and the chart ticks', () => {
    const current = trailingMonthWindows(new Date('2026-09-25T10:00:00Z')).at(-1);
    expect(current?.label).toBe('Sep 2026');
    expect(current?.tick).toBe('Sep');
  });

  it('crosses the year cleanly', () => {
    const windows = trailingMonthWindows(new Date('2026-02-10T08:00:00Z'));
    expect(keys(windows).slice(-3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(windows.at(-2)?.label).toBe('Jan 2026');
    expect(windows.at(-3)?.label).toBe('Dec 2025');
  });

  it('keeps every month once when today is the 31st', () => {
    // setUTCMonth(month - 1) on March 31 lands on "February 31", which is
    // March 3, so a date-shifting implementation shows March twice and skips
    // February entirely.
    const windows = trailingMonthWindows(new Date('2026-03-31T12:00:00Z'));
    const monthKeys = keys(windows);
    expect(new Set(monthKeys).size).toBe(ACCOUNT_MONTHS_WINDOW);
    expect(monthKeys.filter((key) => key === '2026-02')).toHaveLength(1);
    expect(monthKeys.at(-1)).toBe('2026-03');
  });

  it('builds windows that touch end to end on UTC midnight of the 1st', () => {
    const windows = trailingMonthWindows(new Date('2026-09-25T10:00:00Z'));
    expect(windows[0].startIso).toBe('2025-10-01T00:00:00.000Z');
    expect(windows.at(-1)?.startIso).toBe('2026-09-01T00:00:00.000Z');
    expect(windows.at(-1)?.endIso).toBe('2026-10-01T00:00:00.000Z');
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index].startIso).toBe(windows[index - 1].endIso);
    }
  });

  it('uses UTC, not the server clock, to decide the current month', () => {
    // 12:00 UTC on September 30 is already October 1 in Kiritimati (UTC+14),
    // so reading the date in local time would call October the current month.
    vi.stubEnv('TZ', 'Pacific/Kiritimati');
    const windows = trailingMonthWindows(new Date('2026-09-30T12:00:00Z'));
    expect(windows.at(-1)?.monthKey).toBe('2026-09');
    expect(windows.at(-1)?.startIso).toBe('2026-09-01T00:00:00.000Z');
    expect(windows.at(-1)?.endIso).toBe('2026-10-01T00:00:00.000Z');
  });

  it('returns nothing for an invalid date or a zero count', () => {
    expect(trailingMonthWindows(new Date('not a date'))).toEqual([]);
    expect(trailingMonthWindows(new Date('2026-09-25T10:00:00Z'), 0)).toEqual([]);
  });
});

describe('buildAccountMonths', () => {
  const windows = trailingMonthWindows(new Date('2026-09-25T10:00:00Z'));

  it('works running totals backwards from the exact total', () => {
    const counts = [...Array.from({ length: 10 }, () => 0), 5, 10];
    const months = buildAccountMonths(
      windows.map((window, index) => ({ window, newAccounts: counts[index] })),
      100
    );
    expect(months.map((month) => month.newAccounts)).toEqual(counts);
    expect(months.map((month) => month.totalAtMonthEnd).slice(-3)).toEqual([85, 90, 100]);
    expect(months[0].totalAtMonthEnd).toBe(85);
  });

  it('ends on the total even when some accounts fall outside the window', () => {
    const months = buildAccountMonths(
      windows.map((window, index) => ({ window, newAccounts: index === 11 ? 2 : 0 })),
      40
    );
    expect(months.at(-1)?.totalAtMonthEnd).toBe(40);
    expect(months.at(-2)?.totalAtMonthEnd).toBe(38);
  });

  it('never shows a negative running total', () => {
    // The counts are not one snapshot, so an account arriving between two of
    // them can make the months add up to more than the total.
    const months = buildAccountMonths(
      [
        { window: windows[10], newAccounts: 2 },
        { window: windows[11], newAccounts: 4 },
      ],
      3
    );
    expect(months.map((month) => month.totalAtMonthEnd)).toEqual([0, 3]);
  });

  it('treats a missing or broken count as zero', () => {
    const months = buildAccountMonths(
      [
        { window: windows[10], newAccounts: Number.NaN },
        { window: windows[11], newAccounts: -4 },
      ],
      7
    );
    expect(months.map((month) => month.newAccounts)).toEqual([0, 0]);
    expect(months.map((month) => month.totalAtMonthEnd)).toEqual([7, 7]);
  });

  it('keeps each window’s labels on its row', () => {
    const months = buildAccountMonths(
      windows.map((window) => ({ window, newAccounts: 1 })),
      12
    );
    expect(months.at(-1)).toMatchObject({ monthKey: '2026-09', label: 'Sep 2026', isCurrent: true });
  });
});

describe('loadAccountMonths', () => {
  // An in-memory stand-in for the database's `gte start, lt end` count, so the
  // month edges are tested with real timestamps.
  const createdAt = [
    '2025-06-14T09:00:00.000Z', // before the window
    '2026-08-31T23:59:59.999Z', // last instant of August
    '2026-09-01T00:00:00.000Z', // first instant of September
    '2026-09-30T23:59:59.999Z',
    '2026-10-01T00:00:00.000Z', // first instant of October
    '2026-10-14T18:30:00.000Z',
  ];

  const fakeCount = (rows: string[]) =>
    vi.fn(async (range?: CountRange) =>
      rows.filter((iso) => !range || (iso >= range.startIso && iso < range.endIso)).length
    );

  it('counts each account in the month it joined, edges included', async () => {
    const summary = await loadAccountMonths(fakeCount(createdAt), new Date('2026-10-15T12:00:00Z'));
    expect(summary.total).toBe(6);
    const byKey = Object.fromEntries(summary.months.map((month) => [month.monthKey, month.newAccounts]));
    expect(byKey['2026-08']).toBe(1);
    expect(byKey['2026-09']).toBe(2);
    expect(byKey['2026-10']).toBe(2);
    expect(summary.months.at(-1)?.totalAtMonthEnd).toBe(6);
    // The June 2025 account sits before the window and folds into the
    // running total of the earliest month shown.
    expect(summary.months[0].totalAtMonthEnd).toBe(1);
  });

  it('asks for the total once and each month once', async () => {
    const count = fakeCount(createdAt);
    await loadAccountMonths(count, new Date('2026-10-15T12:00:00Z'));
    expect(count).toHaveBeenCalledTimes(1 + ACCOUNT_MONTHS_WINDOW);
    expect(count.mock.calls.filter(([range]) => range === undefined)).toHaveLength(1);
  });

  it('fails as a whole when any count fails', async () => {
    const count = vi.fn(async (range?: CountRange) => {
      if (range?.startIso === '2026-09-01T00:00:00.000Z') throw new Error('Could not read accounts.');
      return 0;
    });
    await expect(loadAccountMonths(count, new Date('2026-10-15T12:00:00Z'))).rejects.toThrow(
      'Could not read accounts.'
    );
  });
});
