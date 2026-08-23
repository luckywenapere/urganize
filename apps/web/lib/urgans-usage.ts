// The assistant's monthly action window, computed rather than stored.
//
// THE DESIGN DECISION, because it is not obvious and the obvious version is
// broken: you cannot get a period START by subtracting an interval from
// `subscriptions.expires_at`.
//
//   - The renewal path advances `expires_at` with `setMonth(+1)` /
//     `setFullYear(+1)` (lib/billing-plans.ts), which CLAMPS on short months.
//     Jan 31 + 1 month is Mar 2 or 3, and because each renewal re-adds from the
//     already-clamped value, a derived anniversary DRIFTS every cycle. Walking
//     backwards from it can double-reset or skip a reset.
//   - The interval is not recoverable from `subscriptions.plan` under the tier
//     model: `manager` and `label` say nothing about monthly vs annual, and
//     nothing stores the interval.
//   - An admin `mark_paid` writes an arbitrary `expires_at` for a hand-negotiated
//     term, and `custom` is +100 years.
//
// So this takes ONLY the day-of-month off `expires_at` as an anchor and builds
// the window containing `now` from `now`. Nothing accumulates, so nothing
// drifts: the same inputs always produce the same window, and the answer is
// recomputed on every call rather than carried forward.
//
// Founder call: MONTHLY windows for everyone, anchored to the billing day. An
// annual subscriber gets 150 actions each month on their billing day, not 150
// for the whole year — the entitlement is named `urgans_monthly_actions` and
// 150-per-year on the plan we most want people on would be a mis-sale.
//
// Only a team resolving to the `manager` tier needs a window at all. Trial,
// grace, comped, walled, founding and legacy teams all resolve to `label`,
// which is uncapped, so every awkward case is moot by construction.

/** Day-of-month the window turns over on, when no anchor can be read. The 1st
 * is the least surprising default and matches what a user would assume. */
export const DEFAULT_ANCHOR_DAY = 1;

/** Pull the billing day out of an anchor timestamp. UTC throughout: the whole
 * point is a stable integer, and reading a local day would move the boundary
 * with the server's timezone. */
export function readAnchorDay(anchorIso: string | null | undefined): number {
  if (!anchorIso) return DEFAULT_ANCHOR_DAY;
  const date = new Date(anchorIso);
  if (Number.isNaN(date.getTime())) return DEFAULT_ANCHOR_DAY;
  return date.getUTCDate();
}

const daysInUtcMonth = (year: number, monthIndex: number): number =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

/** The anchor day landing inside a given month, clamped to that month's length.
 * A team billed on the 31st turns over on the 28th in February — the same
 * clamping every subscription service does, and the reason the window has to be
 * built forwards rather than derived by subtraction. */
function anchorDateFor(year: number, monthIndex: number, anchorDay: number): Date {
  const day = Math.min(anchorDay, daysInUtcMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}

export type UsageWindow = {
  /** Inclusive. */
  start: Date;
  /** Exclusive. */
  end: Date;
};

/**
 * The window containing `now`.
 *
 * Built by finding this month's anchor date and stepping back one month if
 * `now` has not reached it yet. Both boundaries are computed from `now` every
 * call, so repeated calls across a year cannot drift.
 */
export function resolveUsageWindow(input: {
  now: Date;
  anchorIso?: string | null;
}): UsageWindow {
  const anchorDay = readAnchorDay(input.anchorIso);
  const now = input.now;
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();

  const thisMonth = anchorDateFor(year, monthIndex, anchorDay);

  if (now.getTime() >= thisMonth.getTime()) {
    return { start: thisMonth, end: anchorDateFor(year, monthIndex + 1, anchorDay) };
  }
  return { start: anchorDateFor(year, monthIndex - 1, anchorDay), end: thisMonth };
}

/** ISO string for the count query's lower bound. */
export function usageWindowStartIso(input: { now: Date; anchorIso?: string | null }): string {
  return resolveUsageWindow(input).start.toISOString();
}
