/**
 * New Urganize accounts per calendar month, for the admin Growth page
 * (founder request, 2026-09-25). Pure: the route hands in a function that
 * counts accounts in a date range, and this module decides the ranges and
 * turns the counts into table rows. That split is what lets vitest check the
 * month edges with real timestamps and no database.
 *
 * MONTHS ARE UTC. Every boundary is built with Date.UTC(year, month - n, 1),
 * never by shifting a Date with setUTCMonth: on March 31 that lands on
 * "February 31", which is March 3, and February vanishes from the chart. The
 * page's weekly waitlist numbers are UTC as well (Postgres date_trunc on
 * NOW()), so the two sections agree about when a period starts.
 */

export const ACCOUNT_MONTHS_WINDOW = 12;

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export type MonthWindow = {
  /** 'YYYY-MM' in UTC. */
  monthKey: string;
  /** 'Sep 2026', for the table and the readout. */
  label: string;
  /** 'Sep', for the chart's tick row. */
  tick: string;
  /** Inclusive start: UTC midnight on the 1st, as an ISO string. */
  startIso: string;
  /** Exclusive end: the next window's start. */
  endIso: string;
  /** True for the month that is still in progress. */
  isCurrent: boolean;
};

export type AccountMonth = MonthWindow & {
  newAccounts: number;
  /** Accounts that existed by the end of this month (by now, for the current one). */
  totalAtMonthEnd: number;
};

export type AccountMonthsSummary = {
  /** Every account, exact. */
  total: number;
  /** Oldest first, ending with the current month. */
  months: AccountMonth[];
};

export type CountRange = { startIso: string; endIso: string };

/**
 * Counts accounts created in `[startIso, endIso)`, or all accounts when no
 * range is given. Must throw rather than return 0 on failure: a zero is a
 * real answer, and passing one off as a failure would invent a quiet month.
 */
export type CountAccounts = (range?: CountRange) => Promise<number>;

/** The trailing `count` calendar months, oldest first, ending with `now`'s month. */
export function trailingMonthWindows(now: Date, count: number = ACCOUNT_MONTHS_WINDOW): MonthWindow[] {
  if (!Number.isFinite(now.getTime()) || count <= 0) return [];

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const windows: MonthWindow[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const start = new Date(Date.UTC(year, month - offset, 1));
    const end = new Date(Date.UTC(year, month - offset + 1, 1));
    const startYear = start.getUTCFullYear();
    const startMonth = start.getUTCMonth();
    const tick = MONTH_ABBREVIATIONS[startMonth];

    windows.push({
      monthKey: `${startYear}-${String(startMonth + 1).padStart(2, '0')}`,
      label: `${tick} ${startYear}`,
      tick,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      isCurrent: offset === 0,
    });
  }

  return windows;
}

/**
 * Attaches the running total to each month, working BACKWARDS from the exact
 * total: the last row is the total, and each earlier row takes away the
 * months after it. Counting forwards instead would need a separate "before
 * the window" count and would stop agreeing with the Total tile the moment a
 * row had no created_at. Accounts older than the window, and any undated
 * ones, fold into the earliest months shown.
 *
 * Clamped at zero because the counts are separate queries, not one snapshot:
 * an account created between two of them can make the months add up to more
 * than the total.
 */
export function buildAccountMonths(
  counted: Array<{ window: MonthWindow; newAccounts: number }>,
  total: number
): AccountMonth[] {
  const months: AccountMonth[] = new Array(counted.length);
  let runningTotal = safeCount(total);

  for (let index = counted.length - 1; index >= 0; index -= 1) {
    const { window, newAccounts } = counted[index];
    const monthCount = safeCount(newAccounts);
    months[index] = { ...window, newAccounts: monthCount, totalAtMonthEnd: Math.max(0, runningTotal) };
    runningTotal -= monthCount;
  }

  return months;
}

/**
 * Runs the total count and one count per month in parallel. Any failure fails
 * the whole summary: a chart with one month silently missing would read as a
 * month with no sign-ups.
 */
export async function loadAccountMonths(
  countAccounts: CountAccounts,
  now: Date = new Date(),
  count: number = ACCOUNT_MONTHS_WINDOW
): Promise<AccountMonthsSummary> {
  const windows = trailingMonthWindows(now, count);
  const [total, ...monthCounts] = await Promise.all([
    countAccounts(),
    ...windows.map((window) => countAccounts({ startIso: window.startIso, endIso: window.endIso })),
  ]);

  return {
    total: safeCount(total),
    months: buildAccountMonths(
      windows.map((window, index) => ({ window, newAccounts: monthCounts[index] })),
      total
    ),
  };
}

function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
