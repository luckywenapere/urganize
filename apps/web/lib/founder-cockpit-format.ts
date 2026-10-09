import type { WeekChange } from './founder-cockpit';

// How the founder cockpit reads as words. Kept apart from ./founder-cockpit.ts
// so the admin hub can import it without pulling the counting rules (and the
// billing helpers behind them) into the browser. Types only from there.

const wholeNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });
const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** YC's weekly growth bars (Paul Graham, "Startup = Growth"). */
export const YC_GOOD_WEEKLY_GROWTH = 0.05;
export const YC_GREAT_WEEKLY_GROWTH = 0.1;
/** At or under 1% a week, YC reads it as not yet figured out. */
export const YC_FLAT_WEEKLY_GROWTH = 0.01;

/** "+12%", "-8%", "0%". Null (growth from zero) reads "No % yet". */
export function formatSignedPercent(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return 'No % yet';
  const rounded = Math.round(rate * 100);
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/** "Up 2 from 3 last week", "Down 1 from 4 last week", "Same as last week". */
export function formatWeekChange(change: WeekChange): string {
  if (change.delta === 0) return 'Same as last week';
  const direction = change.delta > 0 ? 'Up' : 'Down';
  return `${direction} ${wholeNumber.format(Math.abs(change.delta))} from ${wholeNumber.format(change.previous)} last week`;
}

/**
 * A plain verdict on a weekly growth rate against YC's bars: 5 to 7% a week is
 * good, 10% is exceptional, 1% or less means the thing is not working yet.
 */
export function growthVerdict(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return 'Not enough weeks to tell yet';
  if (rate >= YC_GREAT_WEEKLY_GROWTH) return "Faster than YC's best pace";
  if (rate >= YC_GOOD_WEEKLY_GROWTH) return "On YC's good pace";
  if (rate > YC_FLAT_WEEKLY_GROWTH) return "Growing, under YC's 5% a week";
  if (rate >= -YC_FLAT_WEEKLY_GROWTH) return 'Flat';
  return 'Shrinking';
}

/** "Under a day", "1 day", "4 days". Null reads "No rollouts yet". */
export function formatDays(days: number | null): string {
  if (days === null || !Number.isFinite(days)) return 'No rollouts yet';
  if (days < 1) return 'Under a day';
  const rounded = Math.round(days);
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

/** "9 Oct", the day a rolling week ended, in UTC like every board date. */
export function formatWeekEnd(iso: string): string {
  const value = Date.parse(iso);
  return Number.isFinite(value) ? shortDate.format(new Date(value)) : '';
}
