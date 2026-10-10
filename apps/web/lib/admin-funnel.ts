import { ACTIVATION_WINDOW_DAYS } from './activation';
import { isActivatedTeam, type ScoreboardInput, type ScoreboardRelease } from './scoreboard';

// The sign-up funnel on the founder cockpit (2026-10-09, iteration 2 of the
// admin loop; plan in docs/admin/dashboard-roadmap.md).
//
// PURE, like ./scoreboard.ts and ./founder-cockpit.ts: no database, no clock,
// no environment. It takes the Scoreboard's own input, so a team, a real
// rollout, activation and "paid" mean what they mean on the Scoreboard.
//
// Choices made here, stated so they can be changed in one place:
//
//  1. COHORTED. The funnel follows the teams whose owner signed up in the
//     window, and asks how far each of them has got by now. It is not "events
//     that happened in the window". A team counts once its first 3 days are
//     over (the activation window), the same rule as the Scoreboard's
//     Activation, so the 30-day funnel's Activated step equals that number
//     exactly (a test holds it). Newer sign-ups are reported as `tooNew`.
//  2. Each step is counted ON ITS OWN over the cohort, so a team that paid
//     without inviting anyone still shows under Paid. The conversion between
//     two steps is "of the teams at the step before, the share that also
//     reached this one", which can never pass 100% and never hides anyone.
//  3. Every new team gets the 3-day team trial on its own (tasks-server stamps
//     it when the team is made), so "started a trial" would just repeat the
//     account count. The trial step is "trial over": the trial has ended, or
//     the team paid during it. That is who has had to decide whether to pay.
//     Comped and allowlisted teams are left out of it and of Paid: they were
//     never asked to pay (the Scoreboard's trial-to-paid rule).
//  4. Paid is the Scoreboard's trial-to-paid rule: the owner's payment landed
//     (profiles.paid_at) at or after the trial started (or sign-up, for a team
//     with no trial stamp). Any plan, Solo included. A team that paid and later
//     stopped still counts: this is conversion, not today's paying count.
//  5. The waitlist lives in another database (the marketing site's Neon
//     "User" table). It is matched to accounts by email: of the people who
//     joined the waitlist in the window, the share whose email now owns a team.
//     Null when the waitlist could not be read, never a made-up zero.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The windows the funnel can be read over, in days of sign-ups. */
export const FUNNEL_WINDOWS = [30, 90] as const;
export type FunnelWindowDays = (typeof FUNNEL_WINDOWS)[number];

export type FunnelStepKey = 'account' | 'first_rollout' | 'activated' | 'trial_over' | 'paid';

export const FUNNEL_STEP_ORDER: FunnelStepKey[] = [
  'account',
  'first_rollout',
  'activated',
  'trial_over',
  'paid',
];

export type FunnelStep = {
  key: FunnelStepKey;
  /** Teams in the cohort that reached this step (in any order). */
  count: number;
  /** Teams at the step before that also reached this one. 0 for the first step. */
  carried: number;
  /** carried / (count at the step before). Null for the first step or an empty step before. */
  fromPrevious: number | null;
  /** count / accounts. Null when there are no accounts. */
  ofAccounts: number | null;
};

export type WaitlistEntry = { email: string; joinedAt: string };

export type WaitlistStep = {
  /** People who joined the waitlist in the window (each email once). */
  joined: number;
  /** Of those, the ones whose email owns a team today. */
  withAccount: number;
  rate: number | null;
};

export type AdminFunnel = {
  windowDays: number;
  /** The cohort's sign-ups run from `from` to `to` (ISO). `to` is 3 days before now. */
  from: string;
  to: string;
  /** Teams that signed up in the window but are still inside their first 3 days. */
  tooNew: number;
  /** Null when the waitlist was not read (no database, or the read failed). */
  waitlist: WaitlistStep | null;
  steps: FunnelStep[];
};

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Emails are matched lower-cased and trimmed; blanks never match. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const value = (email ?? '').trim().toLowerCase();
  return value.length > 0 ? value : null;
}

/**
 * Of the people who joined the waitlist in [fromMs, toMs], how many have an
 * account that owns a team. Each email counts once.
 */
export function waitlistStep(
  entries: WaitlistEntry[],
  accountEmails: Set<string>,
  fromMs: number,
  toMs: number
): WaitlistStep {
  const joined = new Set<string>();
  for (const entry of entries) {
    const at = ms(entry.joinedAt);
    const email = normalizeEmail(entry.email);
    if (at === null || email === null || at < fromMs || at > toMs) continue;
    joined.add(email);
  }
  let withAccount = 0;
  for (const email of joined) if (accountEmails.has(email)) withAccount += 1;
  return { joined: joined.size, withAccount, rate: ratio(withAccount, joined.size) };
}

/**
 * Turns per-step sets of team ids into counts and conversions. The first set
 * is the cohort itself (accounts).
 */
export function funnelSteps(sets: Array<{ key: FunnelStepKey; ids: Set<string> }>): FunnelStep[] {
  const accounts = sets[0]?.ids.size ?? 0;
  return sets.map((step, index) => {
    if (index === 0) {
      return { key: step.key, count: step.ids.size, carried: 0, fromPrevious: null, ofAccounts: ratio(step.ids.size, accounts) };
    }
    const previous = sets[index - 1].ids;
    let carried = 0;
    for (const id of step.ids) if (previous.has(id)) carried += 1;
    return {
      key: step.key,
      count: step.ids.size,
      carried,
      fromPrevious: ratio(carried, previous.size),
      ofAccounts: ratio(step.ids.size, accounts),
    };
  });
}

/**
 * The funnel for teams whose owner signed up in the last `windowDays` and whose
 * first 3 days are over. `waitlist` is null when it could not be read, and
 * `ownerEmails` maps a team to its owner's email (only used for the waitlist).
 */
export function buildFunnel(
  input: ScoreboardInput,
  windowDays: number,
  waitlist: WaitlistEntry[] | null,
  ownerEmails: Map<string, string | null>
): AdminFunnel {
  const nowMs = input.now.getTime();
  const fromMs = nowMs - windowDays * DAY_MS;
  const toMs = nowMs - ACTIVATION_WINDOW_DAYS * DAY_MS;

  const releasesByTeam = new Map<string, ScoreboardRelease[]>();
  for (const release of input.releases) {
    if (release.isTest) continue;
    const list = releasesByTeam.get(release.workspaceId) ?? [];
    list.push(release);
    releasesByTeam.set(release.workspaceId, list);
  }

  const account = new Set<string>();
  const firstRollout = new Set<string>();
  const activated = new Set<string>();
  const trialOver = new Set<string>();
  const paid = new Set<string>();
  let tooNew = 0;

  for (const team of input.teams) {
    const signup = ms(team.ownerSignedUpAt);
    if (signup === null || signup < fromMs || signup > nowMs) continue;
    if (signup > toMs) {
      tooNew += 1;
      continue;
    }
    const id = team.workspaceId;
    account.add(id);

    const teamReleases = releasesByTeam.get(id) ?? [];
    if (teamReleases.some((release) => {
      const created = ms(release.createdAt);
      return created !== null && created <= nowMs;
    })) {
      firstRollout.add(id);
    }
    if (isActivatedTeam(team, teamReleases)) activated.add(id);

    if (team.comped || team.allowlisted) continue;
    const trialStart = ms(team.trialStartedAt) ?? signup;
    const paidAt = ms(team.ownerPaidAt);
    const didPay = paidAt !== null && paidAt >= trialStart && paidAt <= nowMs;
    if (didPay) paid.add(id);
    const trialEnd = ms(team.trialEndsAt);
    if (didPay || (trialEnd !== null && trialEnd <= nowMs)) trialOver.add(id);
  }

  let waitlistSummary: WaitlistStep | null = null;
  if (waitlist) {
    const accountEmails = new Set<string>();
    for (const email of ownerEmails.values()) {
      const normalized = normalizeEmail(email);
      if (normalized) accountEmails.add(normalized);
    }
    // The waitlist uses the whole window up to now: joining is not something
    // that needs 3 days to settle.
    waitlistSummary = waitlistStep(waitlist, accountEmails, fromMs, nowMs);
  }

  return {
    windowDays,
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    tooNew,
    waitlist: waitlistSummary,
    steps: funnelSteps([
      { key: 'account', ids: account },
      { key: 'first_rollout', ids: firstRollout },
      { key: 'activated', ids: activated },
      { key: 'trial_over', ids: trialOver },
      { key: 'paid', ids: paid },
    ]),
  };
}

/** The funnel over every window in FUNNEL_WINDOWS, smallest first. */
export function buildFunnels(
  input: ScoreboardInput,
  waitlist: WaitlistEntry[] | null,
  ownerEmails: Map<string, string | null>
): AdminFunnel[] {
  return FUNNEL_WINDOWS.map((days) => buildFunnel(input, days, waitlist, ownerEmails));
}
