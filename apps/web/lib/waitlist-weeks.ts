/**
 * The Growth page's weekly waitlist numbers (the marketing site's Neon
 * "User" table), shaped for the "Last 12 weeks" tile and the table's
 * "Change" column. Pure, so vitest can reach it.
 *
 * Each weekly point from GET /api/admin/growth is a RUNNING TOTAL at the end
 * of its week. The difference between two points is the sign-ups in the
 * later week, which leaves the first week's own sign-ups unknowable from the
 * points alone. That is why the route also returns `beforeWindow`, the count
 * from before the first week began: last total minus it is the growth over
 * all 12 weeks. Until 2026-09-25 the tile took last minus FIRST, which only
 * covered 11, and the first row's change read "no change".
 */

export type WaitlistWeek = { weekLabel: string; totalUsers: number };

export type WaitlistSummary = {
  /** Everyone on the waitlist, exact. */
  total: number;
  /** Everyone on the waitlist before the first week shown began. */
  beforeWindow: number;
  /** Oldest first: the running total at the end of each ISO week. */
  weeks: WaitlistWeek[];
};

export type WaitlistWeekChange = WaitlistWeek & {
  /** Sign-ups in this week. Negative when waitlist rows were removed. */
  change: number;
};

/**
 * `growth` is the sign-ups across every week shown, and each row's `change`
 * is that week's own sign-ups, so the changes always add up to the growth.
 *
 * An unknown `beforeWindow` falls back to the first week's own total rather
 * than a guess, which shows that week as no change: the most it will ever
 * understate is one week, and it never invents sign-ups.
 */
export function summarizeWaitlistWeeks(
  weeks: WaitlistWeek[],
  beforeWindow: number
): { growth: number; weeks: WaitlistWeekChange[] } {
  if (weeks.length === 0) return { growth: 0, weeks: [] };

  const start = Number.isFinite(beforeWindow) ? beforeWindow : weeks[0].totalUsers;
  const rows = weeks.map((week, index) => ({
    ...week,
    change: week.totalUsers - (index === 0 ? start : weeks[index - 1].totalUsers),
  }));

  return { growth: weeks[weeks.length - 1].totalUsers - start, weeks: rows };
}
