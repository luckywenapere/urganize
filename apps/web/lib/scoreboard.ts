import { isPricingTierId } from '@urganize/pricing';
import { ACTIVATION_WINDOW_DAYS, isWithinActivationWindow } from './activation';
import { resolveBillingInterval } from './billing-plans';
import type { TeamAccessState } from './team-billing';

// The company scoreboard (2026-10-02), worked out from database rows.
//
// The definitions come from the strategy doc, docs/strategy/company-strategy.md,
// sections 2 and 7. When a definition here and that doc disagree, the doc wins
// and this file is the one to change. Each rule below names the line it
// implements.
//
// PURE. No database, no clock (the caller passes `now`), no environment. The
// admin route (app/api/admin/scoreboard) reads the rows and hands them over;
// everything that decides a number lives here so vitest can check it.
//
// Three choices the doc does not settle, made here and stated so they can be
// changed in one place:
//
//  1. "Did something in Urganize" is read from the user, not the team. A member
//     who acts anywhere in Urganize counts as active for every team they belong
//     to. The doc's own wording ("did something in Urganize") reads that way,
//     and attributing each action to one team would need a join per table for
//     no difference anybody has yet asked about.
//  2. A release "goes live" when its release date arrives, or, failing that,
//     when its last activity is done. This is lib/recap-eligibility.ts's rule
//     (the product's existing answer to "has this release happened"), turned
//     into a WHEN rather than a yes or no. CLAUDE.md asks that nobody invent a
//     third definition.
//  3. A second release counts if it was started any time up to 90 days after
//     the first went live, including before. Somebody planning the next one
//     while the first is still out is running the business in Urganize, which
//     is what the doc says the number is for.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Doc section 7: "within 90 days of their first release going live". */
export const SECOND_RELEASE_WINDOW_DAYS = 90;
/** Doc section 7: "2 or more members did something in Urganize in the last 7 days". */
export const WEEKLY_ACTIVE_MIN_MEMBERS = 2;
/** Doc section 7: "still active in their fourth week". Days 21 to 27. */
export const WEEK_FOUR_START_DAY = 21;
export const WEEK_FOUR_END_DAY = 28;

/** Statuses that are still a subscription somebody pays for. `trialing` is the
 *  retired card trial, where nothing had been paid yet. */
const CURRENT_STATUSES = new Set(['active', 'past_due', 'cancelled']);
/** MRR leaves out `cancelled`: it is paid up to its end date and will not
 *  charge again, so it is not recurring. */
const RECURRING_STATUSES = new Set(['active', 'past_due']);

export type ScoreboardSubscription = {
  userId: string;
  plan: string | null;
  status: string | null;
  /** subscriptions.amount, in kobo (the minor unit every billing path writes). */
  amountMinor: number | null;
  billingInterval: string | null;
  expiresAt: string | null;
  /** subscriptions.started_at: when the current run of paying began. Set by the
   *  first charge and by "Mark paid"; renewals leave it alone. Optional because
   *  only the churn numbers read it. */
  startedAt?: string | null;
};

export type ScoreboardTeam = {
  workspaceId: string;
  name: string | null;
  ownerUserId: string | null;
  createdAt: string | null;
  /** When the owner's account was made (profiles.created_at). */
  ownerSignedUpAt: string | null;
  /** The owner plus every member whose membership is active. */
  memberUserIds: string[];
  /** When the first teammate was invited or joined, owner excluded. */
  firstInviteAt: string | null;
  state: TeamAccessState;
  comped: boolean;
  allowlisted: boolean;
  /** The OWNER's subscription. Money rows are keyed by the owner. */
  subscription: ScoreboardSubscription | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  /** profiles.paid_at for the owner: set when real money first landed. */
  ownerPaidAt: string | null;
};

export type ScoreboardRelease = {
  id: string;
  /** The team the release belongs to. */
  workspaceId: string;
  createdAt: string | null;
  updatedAt: string | null;
  /** releases.release_date, a date with no time ("2026-10-02"). */
  releaseDate: string | null;
  status: string | null;
  isTest: boolean;
  taskCount: number;
  allTasksDone: boolean;
  /** When the last activity on it was marked done. */
  lastTaskDoneAt: string | null;
};

export type ScoreboardInput = {
  now: Date;
  teams: ScoreboardTeam[];
  releases: ScoreboardRelease[];
  /** Every subscription row, not only team owners': MRR includes Solo. */
  subscriptions: ScoreboardSubscription[];
  /** For each user, the times (ms) they did something. */
  activity: Map<string, number[]>;
  /** True when the activity read hit its row cap, so the numbers are a floor. */
  activityTruncated: boolean;
  /** Every account and when it was made (profiles.created_at), for the weekly
   *  return table by signup week (lib/admin-signup-return.ts, URG-267). No
   *  number on this board reads it. Optional so older callers and tests that
   *  build an input by hand need not supply it. */
  users?: { userId: string; signedUpAt: string | null }[];
  /** Teams that came in through a referral link. Null or absent when the tables
   *  could not be read (not migrated yet), so the board shows "not tracked" and
   *  never a misleading zero. */
  referrals?: {
    /** Invited by another team's personal link (referral credits). */
    fromTeams: ReferredSignup[];
    /** Came in through a commission partner's code. */
    fromPartners: ReferredSignup[];
  } | null;
};

export type ReferredSignup = { workspaceId: string; attachedAt: string };

export type SecondReleaseSummary = {
  /** Teams whose first release went live at least 90 days ago. */
  eligible: number;
  /** Of those, the ones that started another release in time. */
  started: number;
  rate: number | null;
  /** Teams whose first release went live less than 90 days ago: not counted yet. */
  waiting: number;
};

export type RetentionCohort = {
  /** The Monday the cohort's week started, as YYYY-MM-DD. */
  weekStart: string;
  teams: number;
  retained: number;
  rate: number | null;
};

export type TrialToPaidSummary = {
  ended: number;
  paid: number;
  paidBeforeEnd: number;
  rate: number | null;
};

export type ActivationSummary = {
  signups: number;
  activated: number;
  rate: number | null;
};

export type ReferralSummary = {
  /** Referred in the last 30 days. */
  last30d: number;
  allTime: number;
  /** Of all of them, the ones that are a paying team today. */
  payingNow: number;
};

export type ReferredSignups = { fromTeams: ReferralSummary; fromPartners: ReferralSummary };

export type ScoreboardTeamRow = {
  workspaceId: string;
  name: string | null;
  state: TeamAccessState;
  plan: string | null;
  paying: boolean;
  members: number;
  activeMembers7d: number;
  lastActiveAt: string | null;
  realReleases: number;
  firstLiveAt: string | null;
  secondReleaseStarted: boolean;
};

export type Scoreboard = {
  generatedAt: string;
  weeklyActivePayingTeams: number;
  payingTeams: number;
  /** Paid or not, so there is a number to watch before anyone pays. */
  weeklyActiveTeams: number;
  activeTeams30d: number;
  teamCount: number;
  mrrMinor: number;
  secondRelease: SecondReleaseSummary;
  /** The same rule over every team, paid or not. */
  secondReleaseAllTeams: SecondReleaseSummary;
  retention: RetentionCohort[];
  trialToPaid: TrialToPaidSummary;
  activation: ActivationSummary;
  /** Doc section 2, "Referred signups: signups from a user's invite". Null when
   *  the referral tables could not be read. */
  referredSignups: ReferredSignups | null;
  activityTruncated: boolean;
  teams: ScoreboardTeamRow[];
};

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function isoDay(value: number): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** The Monday 00:00 UTC that starts the week `date` falls in. */
export function weekStartUtc(date: Date): Date {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

export function isCurrentSubscription(sub: ScoreboardSubscription | null, now: Date): boolean {
  if (!sub) return false;
  if (!CURRENT_STATUSES.has(String(sub.status))) return false;
  if (!sub.amountMinor || sub.amountMinor <= 0) return false;
  const expires = ms(sub.expiresAt);
  return expires !== null && expires > now.getTime();
}

/**
 * Doc section 7: "a current subscription on Manager, Label or Group. Solo
 * subscribers add MRR but don't count as teams."
 *
 * Group is the tier id 'enterprise' (back 2026-10-02), written by "Mark paid" in
 * /admin/teams, and counts like any tier but Solo. A legacy plan id (monthly,
 * annual, custom, ...) was the old single team plan and counts, which matches
 * resolveTeamTier reading those as Label.
 */
export function isPayingTeam(team: ScoreboardTeam, now: Date): boolean {
  if (team.comped || team.allowlisted) return false;
  if (!isCurrentSubscription(team.subscription, now)) return false;
  return isTeamPlan(team.subscription?.plan);
}

/** A plan that makes a team a paying team when it is current: any tier but
 *  Solo, or a legacy plan id. See isPayingTeam. */
export function isTeamPlan(plan: string | null | undefined): boolean {
  const id = String(plan ?? '');
  if (isPricingTierId(id)) return id !== 'solo';
  return id.length > 0;
}

/** Doc section 2: "Subscriptions only, yearly plans at price ÷ 12". In kobo. */
export function monthlyRecurringMinor(subscriptions: ScoreboardSubscription[], now: Date): number {
  let total = 0;
  for (const sub of subscriptions) {
    if (!RECURRING_STATUSES.has(String(sub.status))) continue;
    if (!isCurrentSubscription(sub, now)) continue;
    total += monthlyAmountMinor(sub);
  }
  return total;
}

/** One subscription's price as a monthly amount, in kobo: yearly plans at a
 *  twelfth (doc section 2). Says nothing about whether it is current. */
export function monthlyAmountMinor(sub: ScoreboardSubscription): number {
  const interval = resolveBillingInterval({
    plan: sub.plan,
    storedInterval: sub.billingInterval,
  });
  const amount = sub.amountMinor ?? 0;
  return interval === 'annual' ? Math.round(amount / 12) : amount;
}

/** How many of `memberIds` did something at or after `sinceMs`. */
export function activeMembersSince(
  memberIds: string[],
  lastSeen: Map<string, number>,
  sinceMs: number
): number {
  let count = 0;
  for (const id of new Set(memberIds)) {
    const seen = lastSeen.get(id);
    if (seen !== undefined && seen >= sinceMs) count += 1;
  }
  return count;
}

/** When a release went live, in ms, or null if it has not. See choice 2 above. */
export function releaseLiveAt(release: ScoreboardRelease, now: Date): number | null {
  if (release.releaseDate) {
    const day = ms(`${release.releaseDate.slice(0, 10)}T00:00:00.000Z`);
    if (day !== null && day <= now.getTime()) return day;
  }
  if (release.taskCount > 0 && release.allTasksDone) {
    return ms(release.lastTaskDoneAt) ?? ms(release.updatedAt);
  }
  if (release.status === 'released' || release.status === 'archived') {
    return ms(release.updatedAt);
  }
  return null;
}

function realReleasesByTeam(releases: ScoreboardRelease[]): Map<string, ScoreboardRelease[]> {
  const byTeam = new Map<string, ScoreboardRelease[]>();
  for (const release of releases) {
    if (release.isTest) continue;
    const list = byTeam.get(release.workspaceId) ?? [];
    list.push(release);
    byTeam.set(release.workspaceId, list);
  }
  return byTeam;
}

type SecondReleaseState = {
  firstLiveAt: number | null;
  started: boolean;
  eligible: boolean;
};

function secondReleaseState(teamReleases: ScoreboardRelease[], now: Date): SecondReleaseState {
  let first: { release: ScoreboardRelease; liveAt: number } | null = null;
  for (const release of teamReleases) {
    const liveAt = releaseLiveAt(release, now);
    if (liveAt === null) continue;
    if (!first || liveAt < first.liveAt) first = { release, liveAt };
  }
  if (!first) return { firstLiveAt: null, started: false, eligible: false };

  const deadline = first.liveAt + SECOND_RELEASE_WINDOW_DAYS * DAY_MS;
  const started = teamReleases.some((release) => {
    if (release.id === first.release.id) return false;
    const created = ms(release.createdAt);
    return created !== null && created <= deadline;
  });
  return { firstLiveAt: first.liveAt, started, eligible: deadline <= now.getTime() };
}

/** Doc section 7, second-release rate. The caller decides which teams. */
export function secondReleaseSummary(
  teams: ScoreboardTeam[],
  releases: ScoreboardRelease[],
  now: Date
): SecondReleaseSummary {
  const byTeam = realReleasesByTeam(releases);
  let eligible = 0;
  let started = 0;
  let waiting = 0;
  for (const team of teams) {
    const state = secondReleaseState(byTeam.get(team.workspaceId) ?? [], now);
    if (state.firstLiveAt === null) continue;
    if (state.eligible) {
      eligible += 1;
      if (state.started) started += 1;
    } else {
      waiting += 1;
    }
  }
  return { eligible, started, rate: ratio(started, eligible), waiting };
}

/**
 * Doc section 7: "the share of teams that signed up in a given week and are
 * still active in their fourth week". A team is active if any member did
 * something in days 21 to 27 after the team was made. Only cohorts whose
 * fourth week has finished for every team in them are returned, newest first.
 */
export function weekFourRetention(
  teams: ScoreboardTeam[],
  activity: Map<string, number[]>,
  now: Date,
  cohortCount: number
): RetentionCohort[] {
  const nowMs = now.getTime();
  const cohorts = new Map<string, { teams: number; retained: number }>();

  for (const team of teams) {
    const created = ms(team.createdAt);
    if (created === null) continue;
    const weekStart = weekStartUtc(new Date(created)).getTime();
    // The last team in a cohort is made on its Sunday, so the cohort is only
    // complete once that team's fourth week is over too.
    if (weekStart + 7 * DAY_MS + WEEK_FOUR_END_DAY * DAY_MS > nowMs) continue;

    const from = created + WEEK_FOUR_START_DAY * DAY_MS;
    const to = created + WEEK_FOUR_END_DAY * DAY_MS;
    const retained = team.memberUserIds.some((id) =>
      (activity.get(id) ?? []).some((at) => at >= from && at < to)
    );

    const key = isoDay(weekStart);
    const cohort = cohorts.get(key) ?? { teams: 0, retained: 0 };
    cohort.teams += 1;
    if (retained) cohort.retained += 1;
    cohorts.set(key, cohort);
  }

  return Array.from(cohorts.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, cohortCount)
    .map(([weekStart, cohort]) => ({
      weekStart,
      teams: cohort.teams,
      retained: cohort.retained,
      rate: ratio(cohort.retained, cohort.teams),
    }));
}

/**
 * Doc section 2: "Share of 3-day trials that convert". Trials that ended in
 * the last `lookbackDays`. Comped and allowlisted teams are left out: they
 * were never asked to pay. A payment from before the trial started is an old
 * account, not a conversion.
 */
export function trialToPaidSummary(
  teams: ScoreboardTeam[],
  now: Date,
  lookbackDays: number
): TrialToPaidSummary {
  const nowMs = now.getTime();
  const since = nowMs - lookbackDays * DAY_MS;
  let ended = 0;
  let paid = 0;
  let paidBeforeEnd = 0;

  for (const team of teams) {
    if (team.comped || team.allowlisted) continue;
    const endsAt = ms(team.trialEndsAt);
    if (endsAt === null || endsAt > nowMs || endsAt < since) continue;
    ended += 1;
    const paidAt = ms(team.ownerPaidAt);
    const startedAt = ms(team.trialStartedAt) ?? endsAt - ACTIVATION_WINDOW_DAYS * DAY_MS;
    if (paidAt === null || paidAt < startedAt) continue;
    paid += 1;
    if (paidAt <= endsAt) paidBeforeEnd += 1;
  }

  return { ended, paid, paidBeforeEnd, rate: ratio(paid, ended) };
}

/**
 * Doc section 7: "a first release created and a teammate invited within 3 days
 * of signing up". Accounts that signed up in the last `lookbackDays` and whose
 * 3 days are over. Uses lib/activation.ts's own window, so this number and the
 * `activated` event cannot disagree about what 3 days means.
 */
export function activationSummary(
  teams: ScoreboardTeam[],
  releases: ScoreboardRelease[],
  now: Date,
  lookbackDays: number
): ActivationSummary {
  const nowMs = now.getTime();
  const since = nowMs - lookbackDays * DAY_MS;
  const byTeam = realReleasesByTeam(releases);
  let signups = 0;
  let activated = 0;

  for (const team of teams) {
    const signup = ms(team.ownerSignedUpAt);
    if (signup === null || signup < since) continue;
    if (signup + ACTIVATION_WINDOW_DAYS * DAY_MS > nowMs) continue;
    signups += 1;
    if (isActivatedTeam(team, byTeam.get(team.workspaceId) ?? [])) activated += 1;
  }

  return { signups, activated, rate: ratio(activated, signups) };
}

/**
 * One team's half of the activation rule above: a real (non-test) release
 * created and a teammate invited, both within 3 days of the owner signing up.
 * Exported so the admin funnel (./admin-funnel.ts) asks the same question.
 * `teamReleases` may include test releases; they are skipped here.
 */
export function isActivatedTeam(team: ScoreboardTeam, teamReleases: ScoreboardRelease[]): boolean {
  const signup = ms(team.ownerSignedUpAt);
  if (signup === null) return false;
  const invite = ms(team.firstInviteAt);
  if (invite === null || !isWithinActivationWindow(signup, invite)) return false;
  return teamReleases.some((release) => {
    if (release.isTest) return false;
    const created = ms(release.createdAt);
    return created !== null && isWithinActivationWindow(signup, created);
  });
}

/**
 * Doc section 2: "Referred signups | Signups from a user's invite". Counts the
 * teams that arrived through a referral link, split by who referred them (another
 * team, or a commission partner), so the experiment's result is readable on its
 * own. A referred team is counted only if it is a team on this board: the empty
 * shell every invited teammate is given is left out, the same rule every other
 * number here follows. Each team is counted once per source.
 */
export function referralSummary(
  signups: ReferredSignup[],
  teamIds: Set<string>,
  payingIds: Set<string>,
  now: Date
): ReferralSummary {
  const since = now.getTime() - 30 * DAY_MS;
  const seen = new Set<string>();
  let last30d = 0;
  let payingNow = 0;
  for (const signup of signups) {
    if (!teamIds.has(signup.workspaceId) || seen.has(signup.workspaceId)) continue;
    const at = ms(signup.attachedAt);
    if (at === null) continue;
    seen.add(signup.workspaceId);
    if (at >= since && at <= now.getTime()) last30d += 1;
    if (payingIds.has(signup.workspaceId)) payingNow += 1;
  }
  return { last30d, allTime: seen.size, payingNow };
}

export function buildScoreboard(input: ScoreboardInput): Scoreboard {
  const { now, teams, releases } = input;
  const nowMs = now.getTime();

  const lastSeen = new Map<string, number>();
  for (const [userId, times] of input.activity) {
    let latest = -Infinity;
    for (const at of times) if (at > latest) latest = at;
    if (Number.isFinite(latest)) lastSeen.set(userId, latest);
  }

  const weekAgo = nowMs - 7 * DAY_MS;
  const monthAgo = nowMs - 30 * DAY_MS;
  const byTeam = realReleasesByTeam(releases);
  const payingTeams = teams.filter((team) => isPayingTeam(team, now));
  const payingIds = new Set(payingTeams.map((team) => team.workspaceId));
  const teamIds = new Set(teams.map((team) => team.workspaceId));

  const rows: ScoreboardTeamRow[] = teams.map((team) => {
    const teamReleases = byTeam.get(team.workspaceId) ?? [];
    const second = secondReleaseState(teamReleases, now);
    let latest: number | null = null;
    for (const id of team.memberUserIds) {
      const seen = lastSeen.get(id);
      if (seen !== undefined && (latest === null || seen > latest)) latest = seen;
    }
    return {
      workspaceId: team.workspaceId,
      name: team.name,
      state: team.state,
      plan: team.subscription?.plan ?? null,
      paying: payingIds.has(team.workspaceId),
      members: new Set(team.memberUserIds).size,
      activeMembers7d: activeMembersSince(team.memberUserIds, lastSeen, weekAgo),
      lastActiveAt: latest === null ? null : new Date(latest).toISOString(),
      realReleases: teamReleases.length,
      firstLiveAt: second.firstLiveAt === null ? null : new Date(second.firstLiveAt).toISOString(),
      secondReleaseStarted: second.started,
    };
  });

  rows.sort(
    (a, b) =>
      b.activeMembers7d - a.activeMembers7d ||
      (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '') ||
      (a.name ?? '').localeCompare(b.name ?? '')
  );

  const weeklyActive = (team: ScoreboardTeam) =>
    activeMembersSince(team.memberUserIds, lastSeen, weekAgo) >= WEEKLY_ACTIVE_MIN_MEMBERS;

  return {
    generatedAt: now.toISOString(),
    weeklyActivePayingTeams: payingTeams.filter(weeklyActive).length,
    payingTeams: payingTeams.length,
    weeklyActiveTeams: teams.filter(weeklyActive).length,
    activeTeams30d: teams.filter(
      (team) => activeMembersSince(team.memberUserIds, lastSeen, monthAgo) >= 1
    ).length,
    teamCount: teams.length,
    mrrMinor: monthlyRecurringMinor(input.subscriptions, now),
    secondRelease: secondReleaseSummary(payingTeams, releases, now),
    secondReleaseAllTeams: secondReleaseSummary(teams, releases, now),
    retention: weekFourRetention(teams, input.activity, now, 8),
    trialToPaid: trialToPaidSummary(teams, now, 90),
    activation: activationSummary(teams, releases, now, 30),
    referredSignups: input.referrals
      ? {
          fromTeams: referralSummary(input.referrals.fromTeams, teamIds, payingIds, now),
          fromPartners: referralSummary(input.referrals.fromPartners, teamIds, payingIds, now),
        }
      : null,
    activityTruncated: input.activityTruncated,
    teams: rows,
  };
}
