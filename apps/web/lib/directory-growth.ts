import { WORK_REQUEST_EXPIRY_DAYS } from './work-requests';
import { releaseLiveAt, type ScoreboardRelease } from './scoreboard';
import { weekChange, type WeekChange } from './founder-cockpit';

/**
 * The directory's weekly numbers (2026-10-10), for /admin/directory and the
 * founder cockpit's Directory tile.
 *
 * These answer the spec's test 4: the directory is working when claimed profiles
 * start rollouts and the requests that go out come back answered, and the number
 * that matters is how many rollouts that started in the directory went LIVE.
 *
 * PURE. The caller hands in rows already read (and already stripped of our own
 * accounts, or with the exclusion passed in); this file only counts. A source
 * that could not be read arrives as null and every number built from it is
 * null, shown as "Not tracked", never as a zero. A zero would say "nobody did
 * this" about a table that was never looked at.
 *
 * WEEKS ARE THE COCKPIT'S ROLLING 7 DAYS ending now, not Monday weeks, so a
 * number here and the same number on the cockpit can never disagree about which
 * days belong to "this week".
 *
 * WHAT IS AND IS NOT COUNTED HERE
 *  - seeded: a profile a team made for somebody (created_by_workspace_id is
 *    set), by the week it was made.
 *  - claimed: a profile with a claim time, by the week it was claimed.
 *  - started a rollout: a claimed person's FIRST real rollout made after they
 *    claimed, by the week that rollout was made. Once per person.
 *  - requests: sent, answered yes, answered no, and a reply rate that leaves out
 *    requests still waiting (see summarizeWorkRequests for why). A waiting
 *    request past its seven days reads as closed, as the app does.
 *  - searches: role-filtered searches only. Those are the one search that is
 *    written to a durable row (directory_role_wanted); a search with no role
 *    filter and a profile view live in PostHog, which this admin cannot read.
 *  - live from the directory: rollouts a request named when it was accepted
 *    (work_requests.accepted_release_id), counted once, by the month they
 *    went live. Not tracked until that column exists.
 */

export const DIRECTORY_GROWTH_WEEKS = 8;
export const DIRECTORY_LIVE_MONTHS = 6;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

export type GrowthOwner = { workspaceId: string | null; ownerUserId: string | null };

export type GrowthProfile = {
  userId: string | null;
  workspaceId: string | null;
  createdAt: string;
  claimedAt: string | null;
  /** A team made it (created_by_workspace_id is set). */
  seeded: boolean;
};

export type GrowthInvite = GrowthOwner & { createdAt: string };
export type GrowthSearch = GrowthOwner & { createdAt: string };
export type GrowthRollout = { ownerUserId: string; createdAt: string };
export type GrowthRequest = GrowthOwner & {
  createdAt: string;
  status: string;
  acceptedReleaseId: string | null;
};

export type DirectoryGrowthInput = {
  now: Date;
  /** Null for any source that could not be read. */
  profiles: GrowthProfile[] | null;
  invites: GrowthInvite[] | null;
  /** Real (non-test) rollouts owned by claimed people. */
  rollouts: GrowthRollout[] | null;
  requests: GrowthRequest[] | null;
  /** True when work_requests.accepted_release_id could be read. */
  acceptedTracked: boolean;
  /** When each rollout went live, ms, or null if it has not. */
  liveAtByReleaseId: Map<string, number | null>;
  searches: GrowthSearch[] | null;
  /** Our own accounts, left out of every count. */
  exclusion?: { workspaceIds: Set<string>; userIds: Set<string> };
};

export type DirectoryWeek = {
  /** The day this rolling week ended, an ISO timestamp. */
  endsAt: string;
  seeded: number | null;
  invitesSent: number | null;
  claimed: number | null;
  startedRollout: number | null;
  searches: number | null;
  requestsSent: number | null;
  accepted: number | null;
  passed: number | null;
};

export type DirectoryLiveMonth = {
  /** YYYY-MM, UTC. */
  month: string;
  /** Rollouts a request named, by the month the request was made. */
  started: number;
  /** Of the rollouts a request ever named, those that went live this month. */
  live: number;
};

export type DirectoryTile = {
  claimedThisWeek: WeekChange | null;
  requestsThisWeek: WeekChange | null;
  /** Answered over answered plus closed, over the eight weeks. */
  replyRate: number | null;
  /** Rollouts from the directory that went live this month. */
  liveThisMonth: number | null;
};

export type DirectoryGrowth = {
  weeks: DirectoryWeek[];
  totals: {
    requestsSent: number | null;
    accepted: number | null;
    passed: number | null;
    closed: number | null;
    replyRate: number | null;
  };
  live: { months: DirectoryLiveMonth[] | null; thisMonthLive: number | null };
  tile: DirectoryTile;
};

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function monthKey(time: number): string {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthsEndingAt(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    keys.push(monthKey(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)));
  }
  return keys;
}

type Window = { from: number; to: number };

/** The rolling weeks, oldest first. The newest is open at the end, like the cockpit's. */
function windows(now: Date, count: number): Window[] {
  const nowMs = now.getTime();
  const out: Window[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    out.push({
      from: nowMs - (back + 1) * WEEK_MS,
      to: back === 0 ? Number.POSITIVE_INFINITY : nowMs - back * WEEK_MS,
    });
  }
  return out;
}

function inside(time: number | null, window: Window): boolean {
  return time !== null && time >= window.from && time < window.to;
}

function countIn(times: Array<number | null>, window: Window): number {
  let n = 0;
  for (const time of times) if (inside(time, window)) n += 1;
  return n;
}

export function buildDirectoryGrowth(input: DirectoryGrowthInput): DirectoryGrowth {
  const { now } = input;
  const nowMs = now.getTime();
  const exclusion = input.exclusion;
  const isOurs = (row: Partial<GrowthOwner>) =>
    Boolean(
      exclusion &&
        ((row.workspaceId && exclusion.workspaceIds.has(row.workspaceId)) ||
          (row.ownerUserId && exclusion.userIds.has(row.ownerUserId)))
    );

  const profiles = input.profiles
    ? input.profiles.filter((p) => !isOurs({ workspaceId: p.workspaceId, ownerUserId: p.userId }))
    : null;
  const invites = input.invites ? input.invites.filter((row) => !isOurs(row)) : null;
  const searches = input.searches ? input.searches.filter((row) => !isOurs(row)) : null;
  const requests = input.requests ? input.requests.filter((row) => !isOurs(row)) : null;

  const wins = windows(now, DIRECTORY_GROWTH_WEEKS);

  // First real rollout each claimed person made after claiming.
  let startedAt: Array<number | null> | null = null;
  if (profiles && input.rollouts) {
    const byOwner = new Map<string, number[]>();
    for (const rollout of input.rollouts) {
      const at = ms(rollout.createdAt);
      if (at === null) continue;
      const list = byOwner.get(rollout.ownerUserId) ?? [];
      list.push(at);
      byOwner.set(rollout.ownerUserId, list);
    }
    startedAt = [];
    for (const profileRow of profiles) {
      const claimed = ms(profileRow.claimedAt);
      if (claimed === null || !profileRow.userId) continue;
      const after = (byOwner.get(profileRow.userId) ?? []).filter((at) => at >= claimed);
      if (after.length > 0) startedAt.push(Math.min(...after));
    }
  }

  const seededTimes = profiles ? profiles.filter((p) => p.seeded).map((p) => ms(p.createdAt)) : null;
  const claimedTimes = profiles ? profiles.map((p) => ms(p.claimedAt)) : null;
  const inviteTimes = invites ? invites.map((row) => ms(row.createdAt)) : null;
  const searchTimes = searches ? searches.map((row) => ms(row.createdAt)) : null;

  // A request's outcome as the app reads it: a waiting one past its days is closed.
  const cutoff = nowMs - WORK_REQUEST_EXPIRY_DAYS * DAY_MS;
  type Outcome = 'waiting' | 'accepted' | 'passed' | 'closed';
  const outcomeOf = (row: GrowthRequest, created: number | null): Outcome => {
    if (row.status === 'interested') return 'accepted';
    if (row.status === 'passed') return 'passed';
    if (row.status === 'expired') return 'closed';
    if (created !== null && created < cutoff) return 'closed';
    return 'waiting';
  };
  const requestRows = requests
    ? requests.map((row) => {
        const created = ms(row.createdAt);
        return { created, outcome: outcomeOf(row, created), row };
      })
    : null;

  const weeks: DirectoryWeek[] = wins.map((win, index) => {
    const endsAt = new Date(
      index === wins.length - 1 ? nowMs : win.to
    ).toISOString();
    const reqIn = requestRows?.filter((r) => inside(r.created, win)) ?? null;
    return {
      endsAt,
      seeded: seededTimes ? countIn(seededTimes, win) : null,
      invitesSent: inviteTimes ? countIn(inviteTimes, win) : null,
      claimed: claimedTimes ? countIn(claimedTimes, win) : null,
      startedRollout: startedAt ? countIn(startedAt, win) : null,
      searches: searchTimes ? countIn(searchTimes, win) : null,
      requestsSent: reqIn ? reqIn.length : null,
      accepted: reqIn ? reqIn.filter((r) => r.outcome === 'accepted').length : null,
      passed: reqIn ? reqIn.filter((r) => r.outcome === 'passed').length : null,
    };
  });

  const windowStart = wins[0].from;
  const inWindowRequests = requestRows?.filter((r) => r.created !== null && r.created >= windowStart) ?? null;
  const totals = inWindowRequests
    ? (() => {
        const accepted = inWindowRequests.filter((r) => r.outcome === 'accepted').length;
        const passed = inWindowRequests.filter((r) => r.outcome === 'passed').length;
        const closed = inWindowRequests.filter((r) => r.outcome === 'closed').length;
        const known = accepted + passed + closed;
        return {
          requestsSent: inWindowRequests.length,
          accepted,
          passed,
          closed,
          replyRate: known === 0 ? null : (accepted + passed) / known,
        };
      })()
    : { requestsSent: null, accepted: null, passed: null, closed: null, replyRate: null };

  // Rollouts from the directory, once each, by month.
  let months: DirectoryLiveMonth[] | null = null;
  let thisMonthLive: number | null = null;
  if (requests && input.acceptedTracked) {
    const keys = monthsEndingAt(now, DIRECTORY_LIVE_MONTHS);
    const table = new Map<string, DirectoryLiveMonth>(keys.map((key) => [key, { month: key, started: 0, live: 0 }]));
    const firstRequestAt = new Map<string, number>();
    for (const row of requests) {
      if (row.status !== 'interested' || !row.acceptedReleaseId) continue;
      const created = ms(row.createdAt);
      if (created === null) continue;
      const earlier = firstRequestAt.get(row.acceptedReleaseId);
      if (earlier === undefined || created < earlier) firstRequestAt.set(row.acceptedReleaseId, created);
    }
    for (const [releaseId, created] of firstRequestAt) {
      const started = table.get(monthKey(created));
      if (started) started.started += 1;
      const liveAt = input.liveAtByReleaseId.get(releaseId) ?? null;
      if (liveAt !== null && liveAt <= nowMs) {
        const liveMonth = table.get(monthKey(liveAt));
        if (liveMonth) liveMonth.live += 1;
      }
    }
    months = keys.map((key) => table.get(key) as DirectoryLiveMonth);
    thisMonthLive = months[months.length - 1].live;
  }

  const compare = (series: Array<number | null>): WeekChange | null => {
    const current = series[series.length - 1];
    const previous = series[series.length - 2];
    if (current === null || previous === null) return null;
    return weekChange(current, previous);
  };

  return {
    weeks,
    totals,
    live: { months, thisMonthLive },
    tile: {
      claimedThisWeek: compare(weeks.map((week) => week.claimed)),
      requestsThisWeek: compare(weeks.map((week) => week.requestsSent)),
      replyRate: totals.replyRate,
      liveThisMonth: thisMonthLive,
    },
  };
}

/**
 * When each named rollout went live, by the Scoreboard's own rule
 * (releaseLiveAt: the release day arrived, or every activity is done). A
 * rollout that is not in the list (deleted, or not read) is null: not live,
 * never guessed live.
 */
export function buildLiveAtMap(
  releaseIds: Iterable<string>,
  releases: ScoreboardRelease[],
  now: Date
): Map<string, number | null> {
  const byId = new Map(releases.map((release) => [release.id, release]));
  const out = new Map<string, number | null>();
  for (const id of releaseIds) {
    const release = byId.get(id);
    out.set(id, release && !release.isTest ? releaseLiveAt(release, now) : null);
  }
  return out;
}
