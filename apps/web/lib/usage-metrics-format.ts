// Words for the usage dashboard (2026-10-07). Client-safe and pure, so the page
// can import it and vitest can reach it.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Written out rather than Intl: month names differ between ICU versions ("Sep"
// in one browser, "Sept" in another) and a test should not depend on that.
// Lagos is UTC+1 all year, so shifting by an hour and reading UTC parts is exact.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

function lagosParts(at: number) {
  const shifted = new Date(at + LAGOS_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** "just now", "4 min ago", "3 h ago", "yesterday", "6 days ago", then a date. */
export function timeAgo(iso: string | null, now: Date): string {
  if (!iso) return 'Never';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'Never';
  const gap = Math.max(0, now.getTime() - at);
  if (gap < MINUTE) return 'just now';
  if (gap < HOUR) return `${Math.floor(gap / MINUTE)} min ago`;
  if (gap < DAY) return `${Math.floor(gap / HOUR)} h ago`;
  const days = Math.floor(gap / DAY);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return formatDate(iso, now);
}

/** "7 Oct", or "7 Oct 2025" when the year is not this one. Lagos time. */
export function formatDate(iso: string | null, now: Date): string {
  if (!iso) return 'Unknown';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return 'Unknown';
  const parts = lagosParts(at);
  const label = `${parts.day} ${MONTHS[parts.month]}`;
  return parts.year === lagosParts(now.getTime()).year ? label : `${label} ${parts.year}`;
}

/** "14:05", Lagos time. */
export function formatClock(iso: string): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const { hour, minute } = lagosParts(at);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** A share as a whole percent; "No data" when there is nothing to divide. */
export function formatShare(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return 'No data';
  return `${Math.round(rate * 100)}%`;
}

/** Week-over-week growth with its sign: "+86%", "-14%", "0%". */
export function formatGrowth(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return 'No data';
  const percent = Math.round(rate * 100);
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

/** Dollars with cents under $100, whole dollars above. */
export function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Not tracked';
  return value < 100 ? `$${value.toFixed(2)}` : `$${Math.round(value).toLocaleString('en')}`;
}

/** "1 person", "3 people". */
export function people(count: number): string {
  return `${count.toLocaleString('en')} ${count === 1 ? 'person' : 'people'}`;
}
