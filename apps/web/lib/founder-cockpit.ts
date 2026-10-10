import {
  WEEKLY_ACTIVE_MIN_MEMBERS,
  isPayingTeam,
  weekFourRetention,
  type ActivationSummary,
  type RetentionCohort,
  type Scoreboard,
  type ScoreboardInput,
} from './scoreboard';
import { stalledStage, type StalledAt } from './admin-message-list';

// The founder cockpit (2026-10-09): the few numbers at the top of /admin that
// say, in ten seconds, whether the company moved this week.
//
// PURE, like ./scoreboard.ts. It takes the scoreboard's own input and the board
// already built from it, so every definition here is the strategy doc's
// (docs/strategy/company-strategy.md, sections 2 and 7) and nothing is counted a
// second way. What this file adds is TIME: the scoreboard answers "where are we
// now", the cockpit answers "which way are we moving", plus who needs a message.
//
// Choices made here, stated so they can be changed in one place:
//
//  1. A "week" is a rolling 7 days ending now (and each 7 days before it), not
//     a calendar week, so this week's number matches the Scoreboard's North Star
//     exactly and is never a half-week.
//  2. Past weeks use TODAY's paying status and TODAY's team members, because no
//     history of either is stored. A team that started paying this week counts
//     as paying in earlier weeks too. The page says so. The "every team" line
//     has no such caveat about paying, which is one reason it is shown beside it.
//  3. A team made after a week ended is left out of that week.
//  4. Growth from zero has no percentage. It is reported as null, never as
//     infinity or 100%, and the page shows the plain change instead.
//  5. Weekly growth over 4 weeks is compounded (the a16z CMGR formula, weekly):
//     (this week / 4 weeks ago) ^ (1/4) - 1. Null when 4 weeks ago was zero.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** How many weeks the trend shows, newest last. */
export const COCKPIT_WEEKS = 8;
/** Weeks back the compounded growth rate measures over. */
export const GROWTH_SPAN_WEEKS = 4;
/** Sign-ups this recent are measured for time to first rollout. */
export const FIRST_ROLLOUT_LOOKBACK_DAYS = 90;
/** Complete week-4 cohorts pooled into one retention figure. */
export const RETENTION_POOL_COHORTS = 4;
/** At most this many teams in the "needs a message" list. */
export const AT_RISK_LIMIT = 8;

export type WeekPoint = {
  /** When the 7 days ended, ISO. The newest point ends at `now`. */
  endsAt: string;
  /** Paying teams with 2+ members active in those 7 days (today's paying set). */
  activePayingTeams: number;
  /** Any team, paid or not, with 2+ members active in those 7 days. */
  activeTeams: number;
};

export type WeekChange = {
  current: number;
  previous: number;
  delta: number;
  /** delta / previous, or null when previous is 0. */
  pct: number | null;
};

export type FirstRolloutSummary = {
  /** Teams whose owner signed up in the lookback window. */
  signups: number;
  /** Of those, the ones that have made a real rollout. */
  withRollout: number;
  /** Median days from sign-up to first rollout, among those that made one. */
  medianDays: number | null;
};

export type PooledRetention = {
  /** How many complete cohorts were pooled (0 to RETENTION_POOL_COHORTS). */
  cohorts: number;
  teams: number;
  retained: number;
  rate: number | null;
};

export type AtRiskReason = 'paying_quiet' | 'went_quiet';

export type AtRiskTeam = {
  workspaceId: string;
  name: string | null;
  reason: AtRiskReason;
  paying: boolean;
  members: number;
  activeMembers7d: number;
  lastActiveAt: string | null;
  /** The first lifecycle stage (strategy doc section 6) the team has not
   *  finished, and what is missing. See lib/admin-message-list.ts. */
  stalledAt: StalledAt;
  /** The team owner's name and email (profiles), filled in by the route with
   *  attachOwnerContacts. Null until then, or when the profile has none. */
  ownerName: string | null;
  ownerEmail: string | null;
};

export type FounderCockpit = {
  generatedAt: string;
  /** The North Star: weekly active paying teams, this week against last. */
  northStar: WeekChange;
  /** Weekly active teams, paid or not: the number that moves before anyone pays. */
  activeTeams: WeekChange;
  /** Compounded weekly growth of weekly active teams over GROWTH_SPAN_WEEKS. */
  activeTeamsWeeklyGrowth: number | null;
  /** Oldest first, COCKPIT_WEEKS long. */
  weeks: WeekPoint[];
  payingTeams: number;
  mrrMinor: number;
  activation: ActivationSummary;
  firstRollout: FirstRolloutSummary;
  retention: { latest: RetentionCohort | null; pooled: PooledRetention };
  atRisk: AtRiskTeam[];
  /** Copied from the board: the activity read hit its cap, so counts are a floor. */
  activityTruncated: boolean;
};

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

/** This week against last week. `pct` is null when there is nothing to divide by. */
export function weekChange(current: number, previous: number): WeekChange {
  const delta = current - previous;
  return { current, previous, delta, pct: previous > 0 ? delta / previous : null };
}

/**
 * Compounded growth per period: (latest / first) ^ (1 / periods) - 1. Null
 * when the first value is zero or negative, or `periods` is not positive.
 */
export function compoundedGrowth(first: number, latest: number, periods: number): number | null {
  if (!(first > 0) || !(periods > 0) || latest < 0) return null;
  return Math.pow(latest / first, 1 / periods) - 1;
}

/** The middle value (the mean of the two middle ones for an even count). */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** How many of `memberIds` did something in [fromMs, toMs). Each person once. */
export function activeMembersBetween(
  memberIds: string[],
  activity: Map<string, number[]>,
  fromMs: number,
  toMs: number
): number {
  let count = 0;
  for (const id of new Set(memberIds)) {
    const times = activity.get(id);
    if (times && times.some((at) => at >= fromMs && at < toMs)) count += 1;
  }
  return count;
}

/**
 * Weekly active teams for each of the last `weekCount` rolling weeks, oldest
 * first. The newest week ends at `now` and matches the Scoreboard's own count.
 */
export function weeklyActiveSeries(input: ScoreboardInput, weekCount: number): WeekPoint[] {
  const nowMs = input.now.getTime();
  const paying = new Set(
    input.teams.filter((team) => isPayingTeam(team, input.now)).map((team) => team.workspaceId)
  );
  const points: WeekPoint[] = [];
  for (let back = weekCount - 1; back >= 0; back -= 1) {
    // The newest window is open at the end, the way the Scoreboard counts
    // "at or after 7 days ago", so the two can never disagree about this week.
    const toMs = back === 0 ? Number.POSITIVE_INFINITY : nowMs - back * WEEK_MS;
    const fromMs = nowMs - (back + 1) * WEEK_MS;
    let activeTeams = 0;
    let activePayingTeams = 0;
    for (const team of input.teams) {
      const created = ms(team.createdAt);
      if (created !== null && created >= toMs) continue;
      const active =
        activeMembersBetween(team.memberUserIds, input.activity, fromMs, toMs) >= WEEKLY_ACTIVE_MIN_MEMBERS;
      if (!active) continue;
      activeTeams += 1;
      if (paying.has(team.workspaceId)) activePayingTeams += 1;
    }
    points.push({
      endsAt: new Date(nowMs - back * WEEK_MS).toISOString(),
      activePayingTeams,
      activeTeams,
    });
  }
  return points;
}

/**
 * Time to value: how long a new team takes to make its first real rollout.
 * Counts teams whose owner signed up in the last `lookbackDays`; test rollouts
 * are left out, as on the Scoreboard. A rollout made before the sign-up time
 * (possible when a teammate created it) counts as day 0.
 */
export function firstRolloutSummary(
  input: ScoreboardInput,
  lookbackDays: number
): FirstRolloutSummary {
  const nowMs = input.now.getTime();
  const since = nowMs - lookbackDays * DAY_MS;
  const firstByTeam = new Map<string, number>();
  for (const release of input.releases) {
    if (release.isTest) continue;
    const created = ms(release.createdAt);
    if (created === null) continue;
    const seen = firstByTeam.get(release.workspaceId);
    if (seen === undefined || created < seen) firstByTeam.set(release.workspaceId, created);
  }

  let signups = 0;
  const days: number[] = [];
  for (const team of input.teams) {
    const signup = ms(team.ownerSignedUpAt);
    if (signup === null || signup < since || signup > nowMs) continue;
    signups += 1;
    const first = firstByTeam.get(team.workspaceId);
    if (first === undefined) continue;
    days.push(Math.max(0, (first - signup) / DAY_MS));
  }
  return { signups, withRollout: days.length, medianDays: median(days) };
}

/** The newest complete week-4 cohorts, added together into one rate. */
export function pooledRetention(cohorts: RetentionCohort[]): PooledRetention {
  let teams = 0;
  let retained = 0;
  for (const cohort of cohorts) {
    teams += cohort.teams;
    retained += cohort.retained;
  }
  return { cohorts: cohorts.length, teams, retained, rate: teams > 0 ? retained / teams : null };
}

/**
 * Who needs a message this week:
 *  - `paying_quiet`: a paying team with fewer than 2 members active in the last
 *    7 days. It pays, but it is not counting toward the North Star.
 *  - `went_quiet`: a team (paid or not) that was weekly active the week before
 *    and is not this week.
 * Paying teams first, then the most recently active.
 */
export function atRiskTeams(
  input: ScoreboardInput,
  board: Scoreboard,
  limit: number
): AtRiskTeam[] {
  const nowMs = input.now.getTime();
  const previousFrom = nowMs - 2 * WEEK_MS;
  const previousTo = nowMs - WEEK_MS;
  const teamsById = new Map(input.teams.map((team) => [team.workspaceId, team]));

  const out: AtRiskTeam[] = [];
  for (const row of board.teams) {
    let reason: AtRiskReason | null = null;
    if (row.paying && row.activeMembers7d < WEEKLY_ACTIVE_MIN_MEMBERS) {
      reason = 'paying_quiet';
    } else if (row.activeMembers7d < WEEKLY_ACTIVE_MIN_MEMBERS) {
      const before = activeMembersBetween(
        teamsById.get(row.workspaceId)?.memberUserIds ?? [],
        input.activity,
        previousFrom,
        previousTo
      );
      if (before >= WEEKLY_ACTIVE_MIN_MEMBERS) reason = 'went_quiet';
    }
    if (!reason) continue;
    out.push({
      workspaceId: row.workspaceId,
      name: row.name,
      reason,
      paying: row.paying,
      members: row.members,
      activeMembers7d: row.activeMembers7d,
      lastActiveAt: row.lastActiveAt,
      stalledAt: stalledStage({
        realReleases: row.realReleases,
        members: row.members,
        firstInviteAt: teamsById.get(row.workspaceId)?.firstInviteAt ?? null,
        paying: row.paying,
        firstLiveAt: row.firstLiveAt,
        secondReleaseStarted: row.secondReleaseStarted,
      }),
      ownerName: null,
      ownerEmail: null,
    });
  }

  out.sort(
    (a, b) =>
      Number(b.paying) - Number(a.paying) ||
      (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '') ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );
  return out.slice(0, limit);
}

/**
 * Adds each listed team's owner name and email. Only the "Needs a message"
 * teams get them, so the founder can write to them; the route reads both from
 * the owners' profiles it already loaded. A team with no profile keeps nulls.
 */
export function attachOwnerContacts(
  teams: AtRiskTeam[],
  ownerNames: Map<string, string | null>,
  ownerEmails: Map<string, string | null>
): AtRiskTeam[] {
  return teams.map((team) => ({
    ...team,
    ownerName: ownerNames.get(team.workspaceId) ?? null,
    ownerEmail: ownerEmails.get(team.workspaceId) ?? null,
  }));
}

export function buildFounderCockpit(input: ScoreboardInput, board: Scoreboard): FounderCockpit {
  const weeks = weeklyActiveSeries(input, COCKPIT_WEEKS);
  const latest = weeks[weeks.length - 1];
  const previous = weeks[weeks.length - 2];
  const spanStart = weeks[weeks.length - 1 - GROWTH_SPAN_WEEKS];

  return {
    generatedAt: input.now.toISOString(),
    northStar: weekChange(latest.activePayingTeams, previous?.activePayingTeams ?? 0),
    activeTeams: weekChange(latest.activeTeams, previous?.activeTeams ?? 0),
    activeTeamsWeeklyGrowth: spanStart
      ? compoundedGrowth(spanStart.activeTeams, latest.activeTeams, GROWTH_SPAN_WEEKS)
      : null,
    weeks,
    payingTeams: board.payingTeams,
    mrrMinor: board.mrrMinor,
    activation: board.activation,
    firstRollout: firstRolloutSummary(input, FIRST_ROLLOUT_LOOKBACK_DAYS),
    retention: {
      latest: board.retention[0] ?? null,
      pooled: pooledRetention(
        weekFourRetention(input.teams, input.activity, input.now, RETENTION_POOL_COHORTS)
      ),
    },
    atRisk: atRiskTeams(input, board, AT_RISK_LIMIT),
    activityTruncated: board.activityTruncated,
  };
}
