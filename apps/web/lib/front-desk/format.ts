// Formatting for the front desk. Pure. Every date reads on Lagos time, the way
// the curators and artists using this live, so "Fri 30 Oct" never slips a day
// for an evening timestamp.

const TZ = 'Africa/Lagos';

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: TZ });
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', timeZone: TZ });
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: TZ });

/** A yyyy-mm-dd date is a calendar day: read it at Lagos noon so it never moves. */
const toInstant = (value: string): Date | null => {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+01:00` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "Fri 30 Oct". Empty string for anything unreadable (callers then say nothing). */
export function formatDeskDay(value: string | null | undefined): string {
  const date = value ? toInstant(value) : null;
  if (!date) return '';
  return `${WEEKDAY.format(date)} ${DAY.format(date)} ${MONTH.format(date)}`;
}

/** "Sun" — the short weekday alone, for thread chips inside the same week. */
export function formatDeskWeekday(value: string | null | undefined): string {
  const date = value ? toInstant(value) : null;
  return date ? WEEKDAY.format(date) : '';
}

/** "₦25,000". Empty for null so a missing rate is never shown as ₦0. */
export function formatNaira(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '';
  return `₦${Math.round(value).toLocaleString('en-NG')}`;
}

/** "1 day" / "3 days". */
export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return '';
  const n = Math.round(value);
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** Joins a short list the way a person says it: "A, B and C". */
export function joinList(items: string[]): string {
  const clean = items.map((item) => item.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] || '';
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

/** Capitalises the first letter only. */
export const capitalise = (value: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

/** "Kultured Nativs'" / "Ayo's". */
export function possessive(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}

/** First word of a display name ("Kemi Ade" -> "Kemi"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || '';
}
