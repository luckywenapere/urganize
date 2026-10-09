// How the cockpit's churn numbers read as words. Client-safe (no imports), so
// the cockpit view can use it without pulling the counting rules (and the
// billing helpers behind them) into the browser. The rules: ./admin-churn.ts.

/** Lenny Rachitsky's benchmarks for B2B SMB
 *  (https://www.lennysnewsletter.com/p/monthly-churn-benchmarks and
 *  https://www.lennysnewsletter.com/p/what-is-good-retention-issue-29).
 *  Monthly logo churn: 2.5 to 5% is good, under 1.5% great.
 *  Net revenue retention: about 90% good, 110% great. */
export const LOGO_CHURN_GOOD = 0.05;
export const LOGO_CHURN_GREAT = 0.015;
export const NRR_GOOD = 0.9;
export const NRR_GREAT = 1.1;

export const NOT_TRACKED_NET =
  'Upgrades and downgrades are not kept: a plan change overwrites the price, so the money a team added or lost by changing plan in a month is not stored.';

/** A plain verdict on a monthly logo churn rate against Lenny's B2B SMB bars. */
export function logoChurnVerdict(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return 'No paying teams at the start of the month';
  if (rate < LOGO_CHURN_GREAT) return 'Great: under 1.5% a month';
  if (rate <= LOGO_CHURN_GOOD) return 'Good: 5% a month or less';
  return 'High: over 5% a month';
}

const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Sep 2026" from "2026-09". */
export function formatMonth(month: string): string {
  const value = Date.parse(`${month}-01T00:00:00.000Z`);
  return Number.isFinite(value) ? monthName.format(new Date(value)) : month;
}
