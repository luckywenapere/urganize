/**
 * Calendar days as plain "YYYY-MM-DD" strings and whole-day numbers, for work
 * that is about a DAY (a release day, a spend date, "30 days after") and not
 * about a moment.
 *
 * Lifted out of lib/editorial-pitch.ts (2026-10-09) when release spend needed the
 * same thing, so there is one implementation of "is this a real date" and "days
 * between". Lagos is UTC+1 all year, so "today in Lagos" is lib/presence.ts's
 * presenceDay and is not repeated here.
 *
 * Pure: no imports, no I/O, no environment.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Days since the epoch for a YYYY-MM-DD at the START of a string, or null. A
 * full timestamp reads as its date part, and a date that does not exist
 * (2026-02-30) is null: Date.UTC rolls it over to March without complaint, so
 * the parts are checked back.
 */
export function dayNumber(value: string | null | undefined): number | null {
  const match = DAY_PATTERN.exec(String(value ?? ''));
  if (!match) return null;
  const [, y, m, d] = match;
  const ms = Date.UTC(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(ms)) return null;
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== Number(y) ||
    check.getUTCMonth() + 1 !== Number(m) ||
    check.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return Math.round(ms / MS_PER_DAY);
}

/** The "YYYY-MM-DD" for a whole-day number. */
export function formatDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * A day with some days added, as "YYYY-MM-DD". Null when the start is not a real
 * day. Counts calendar days, so it is exact across month ends and leap years.
 */
export function addDays(value: string | null | undefined, days: number): string | null {
  const start = dayNumber(value);
  if (start === null || !Number.isInteger(days)) return null;
  return formatDay(start + days);
}
