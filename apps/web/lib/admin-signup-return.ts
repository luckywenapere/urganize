// Weekly return rate by signup week (URG-267, 2026-10-14), on /admin/scoreboard.
//
// One row per signup week: the people whose ACCOUNT was made that week
// (profiles.created_at), how many there were, and how many of them came back
// and did something in each of the four weeks after they signed up.
//
// PURE. No database, no clock (the caller passes `now`), no environment. The
// scoreboard route hands over the rows the Scoreboard already read; nothing is
// read twice and nothing is stored.
//
// Rules, stated so they are decided once:
//
//  1. People, not teams. The cohort is every account made that week, an
//     invited teammate included. (The Scoreboard's "Week 4 retention" counts
//     teams; this table is the per-person view beside it.)
//  2. Weeks start on Monday, midnight in Lagos (WAT, UTC+1). Nigeria has kept
//     UTC+1 all year with no clock change, so a fixed offset is exact.
//  3. "Active" is the Scoreboard's own rule: the person did something in
//     Urganize, read from the same eighteen activity tables
//     (ACTIVITY_SOURCES in lib/admin-read-server.ts). Opening the app without
//     doing anything does not count, same as on the Scoreboard.
//  4. Week N is measured from each person's own signup moment: week 1 is days
//     7 to 13 after they signed up, week 2 days 14 to 20, week 3 days 21 to 27,
//     week 4 days 28 to 34. The signup week itself is not a column: almost
//     everyone does something the day they join, so it says nothing about
//     coming back. Note the Scoreboard's team "Week 4 retention" uses days 21
//     to 27 (the doc's "fourth week"), which is week 3 here.
//  5. A week's cell stays blank until that week is over for EVERYONE in the
//     cohort (the last of them signed up on the cohort's Sunday), so a cell is
//     never a half-counted number.
//  6. Task edits were recorded nowhere before 2 October 2026 (CLAUDE.md, "The
//     company scoreboard", item 2). A cohort whose week 1 began before then is
//     marked, because its early weeks undercount.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Lagos is UTC+1 all year (WAT, no daylight saving). */
export const LAGOS_OFFSET_MS = 60 * 60 * 1000;
/** How many weeks after signup the table follows. */
export const RETURN_WEEKS = 4;
/** How many signup weeks the table shows, newest first. */
export const SIGNUP_COHORT_COUNT = 8;
/** task_activity started recording task edits on this day (CLAUDE.md, the
 *  company scoreboard, item 2). Midnight in Lagos. */
export const TASK_EDITS_RECORDED_FROM = '2026-10-02T00:00:00+01:00';

export type SignupUser = {
  userId: string;
  /** profiles.created_at: when the account was made. */
  signedUpAt: string | null;
};

/** One cohort's return in one week after signup. */
export type ReturnCell = {
  /** People in the cohort who did something that week. */
  returned: number;
  /** The cohort's size, repeated so a cell reads on its own ("3/7"). */
  size: number;
  rate: number | null;
};

export type SignupCohort = {
  /** The Monday (Lagos) the signup week started, as YYYY-MM-DD. */
  weekStart: string;
  size: number;
  /** Weeks 1 to 4 after signup. Null where that week is not over yet for
   *  everyone in the cohort. */
  weeks: (ReturnCell | null)[];
  /** True when the cohort's week 1 began before task edits were recorded, so
   *  its numbers undercount. */
  beforeTaskEdits: boolean;
};

export type SignupReturnTable = {
  cohorts: SignupCohort[];
  /** True when any shown cohort is marked beforeTaskEdits. */
  anyBeforeTaskEdits: boolean;
};

/** The Monday 00:00 in Lagos that starts the Lagos week `atMs` falls in, as ms
 *  since the epoch (a real instant: 23:00 UTC the Sunday before). */
export function lagosWeekStart(atMs: number): number {
  const local = atMs + LAGOS_OFFSET_MS;
  const localMidnight = Math.floor(local / DAY_MS) * DAY_MS;
  // 1970-01-01 was a Thursday; getUTCDay on the shifted instant is the Lagos weekday.
  const daysSinceMonday = (new Date(localMidnight).getUTCDay() + 6) % 7;
  return localMidnight - daysSinceMonday * DAY_MS - LAGOS_OFFSET_MS;
}

/** YYYY-MM-DD of a Lagos week start (or any instant), read on the Lagos clock. */
export function lagosDay(atMs: number): string {
  return new Date(atMs + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
}

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

/** Did this person do anything in [from, to)? */
function activeBetween(times: number[] | undefined, from: number, to: number): boolean {
  if (!times) return false;
  for (const at of times) if (at >= from && at < to) return true;
  return false;
}

/**
 * The last `cohortCount` signup weeks (the current, unfinished week included),
 * newest first, with each cohort's size and its return in weeks 1 to 4 after
 * signup. Weeks with no signups are kept as empty rows so a gap is visible.
 * See the rules at the top of this file.
 */
export function weeklyReturnBySignupWeek(
  users: SignupUser[],
  activity: Map<string, number[]>,
  now: Date,
  cohortCount: number = SIGNUP_COHORT_COUNT
): SignupReturnTable {
  const nowMs = now.getTime();
  const recordedFrom = Date.parse(TASK_EDITS_RECORDED_FROM);
  const currentWeek = lagosWeekStart(nowMs);
  const oldestWeek = currentWeek - (cohortCount - 1) * WEEK_MS;

  // Signup times per cohort week, one entry per person.
  const byWeek = new Map<number, { userId: string; signup: number }[]>();
  const seen = new Set<string>();
  for (const user of users) {
    if (!user.userId || seen.has(user.userId)) continue;
    const signup = parseMs(user.signedUpAt);
    if (signup === null || signup > nowMs) continue;
    const week = lagosWeekStart(signup);
    if (week < oldestWeek) continue;
    seen.add(user.userId);
    const list = byWeek.get(week) ?? [];
    list.push({ userId: user.userId, signup });
    byWeek.set(week, list);
  }

  const cohorts: SignupCohort[] = [];
  for (let i = 0; i < cohortCount; i += 1) {
    const week = currentWeek - i * WEEK_MS;
    const members = byWeek.get(week) ?? [];
    const size = members.length;
    const cohortEnd = week + WEEK_MS;
    const weeks: (ReturnCell | null)[] = [];
    for (let n = 1; n <= RETURN_WEEKS; n += 1) {
      // The last person in the cohort signed up just before cohortEnd, so
      // week n is over for everyone once cohortEnd + (n + 1) weeks has passed.
      if (cohortEnd + (n + 1) * WEEK_MS > nowMs) {
        weeks.push(null);
        continue;
      }
      let returned = 0;
      for (const member of members) {
        const from = member.signup + n * WEEK_MS;
        if (activeBetween(activity.get(member.userId), from, from + WEEK_MS)) returned += 1;
      }
      weeks.push({ returned, size, rate: size > 0 ? returned / size : null });
    }
    cohorts.push({
      weekStart: lagosDay(week),
      size,
      weeks,
      // Week 1 of the earliest signup in the week starts at week + 7 days.
      beforeTaskEdits: week + WEEK_MS < recordedFrom,
    });
  }

  return { cohorts, anyBeforeTaskEdits: cohorts.some((cohort) => cohort.size > 0 && cohort.beforeTaskEdits) };
}
