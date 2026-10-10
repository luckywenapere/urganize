import type { WeekChange } from './founder-cockpit';
import { formatWeekChange as formatChangeWords } from './founder-cockpit-format';

// The directory's weekly numbers as words, kept apart from
// ./directory-growth.ts so the admin pages can import them without pulling the
// counting rules into the browser. Types only from there.

const whole = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** A count, or "Not tracked" for a source that could not be read. Zero is a real answer. */
export function formatCount(value: number | null): string {
  return value === null ? 'Not tracked' : whole.format(value);
}

/** "40%". Null (nothing has a known outcome yet) reads "No answers yet". */
export function formatReplyRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return 'No answers yet';
  return `${Math.round(rate * 100)}%`;
}

/** "Up 2 from 1 last week". Null (a source was not read) gives null. */
export function formatWeekCompare(compare: WeekChange | null): string | null {
  return compare ? formatChangeWords(compare) : null;
}

/** "Oct 2026" from "2026-10". Anything else is returned as it came. */
export function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return monthName.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}
