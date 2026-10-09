import { activeMembersBetween } from './founder-cockpit';
import {
  WEEKLY_ACTIVE_MIN_MEMBERS,
  isPayingTeam,
  releaseLiveAt,
  type ScoreboardInput,
  type ScoreboardTeam,
  type SecondReleaseSummary,
} from './scoreboard';

// UrgAns, credits and release outcomes on the founder cockpit (2026-10-09,
// iteration 3 of the admin loop; plan in docs/admin/dashboard-roadmap.md).
//
// PURE, like ./founder-cockpit.ts. It takes the Scoreboard's own input (teams,
// members, activity, releases), so "weekly active", "paying" and "went live"
// mean exactly what they mean on the Scoreboard, plus two optional row sets:
// the AI usage log (ai_usage_events, the record of COST) and the credit ledger
// (credit_ledger, the record of MONEY). Either can be null when it could not be
// read, and every number fed by it is then null ("Not tracked"), never zero.
//
// Choices made here, stated so they can be changed in one place:
//
//  1. The seed-round target (strategy doc section 11, "UrgAns operational
//     value"): "Half of active paying teams use UrgAns inside releases every
//     week". Active paying teams are the North Star's teams this week (paying,
//     2+ members did something in the last 7 days). A team "used UrgAns inside
//     a release" when the usage log has a call in the last 7 days tied to a
//     release (release_id set) for one of its features a person asks for:
//     chat, plan, press kit, pitch kit, Spotify pitch. The status update and
//     the task outcome reply are left out: the app calls them on the side of
//     something else, so they say nothing about choosing UrgAns. A failed call
//     still counts: the person used UrgAns even if the provider let them down.
//  2. A call belongs to a team by its workspace_id; an older row with no
//     workspace falls back to the team its owner_user_id owns.
//  3. Weeks are rolling 7 days ending now, the cockpit's own clock, so "this
//     week" here is the same 7 days as the North Star above it.
//  4. Credits spent = spend rows minus refund rows, in credits. Grants,
//     allowances and adjustments are not spending.
//  5. AI cost is what the provider billed (RODI, turned into dollars at the
//     app's own RODI_PER_USD), from the usage log when it reads, else from the
//     ledger's provider_cost_rodi on spend rows (the /admin/metrics fallback).
//     A failed call's cost is unknown (null) and adds nothing; the page says
//     the figure is a floor. "Per active team" divides by weekly active teams,
//     paid or not, because every team's use costs money.
//  6. A rollout "went live" by the Scoreboard's releaseLiveAt rule (release
//     date arrived, or every activity done). Test rollouts are left out.

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** Strategy doc section 11: half of active paying teams, every week. */
export const URGANS_WEEKLY_TARGET = 0.5;
/** Weeks of credits shown in the chart, newest last. */
export const CREDIT_WEEKS = 8;
/** The usage-log features a person asks for (lib/ai/usage-log.ts AI_USAGE_FEATURES). */
export const URGANS_CHOSEN_FEATURES = new Set(['chat', 'plan', 'press_kit', 'pitch_kit', 'spotify_pitch']);

export type AiUsageRow = {
  workspaceId: string | null;
  ownerUserId: string | null;
  releaseId: string | null;
  feature: string;
  createdAt: string;
  /** Null for a failed call: its cost is unknown. */
  costRodi: number | null;
};

export type CreditLedgerRow = {
  workspaceId: string | null;
  ownerUserId: string | null;
  kind: string;
  /** Signed: a spend is negative, a refund positive. */
  credits: number;
  createdAt: string;
  providerCostRodi: number | null;
};

export type UrgansShare = {
  /** Weekly active paying teams in those 7 days (the North Star). */
  activePayingTeams: number;
  /** Of those, the ones that used UrgAns inside a release. */
  usingInReleases: number;
  /** Of those, the ones that used UrgAns at all (any chosen feature). */
  usingAnywhere: number;
  /** usingInReleases / activePayingTeams. Null when there are none. */
  rate: number | null;
};

export type CreditWeek = { endsAt: string; credits: number };

export type UrgansUsage = {
  target: number;
  /** This week and last. Null when the usage log could not be read. */
  share: { current: UrgansShare; previous: UrgansShare } | null;
  /** Oldest first, CREDIT_WEEKS long. Null when the ledger could not be read. */
  creditWeeks: CreditWeek[] | null;
  /** Weekly active teams this week, paid or not (the per-team denominator). */
  weeklyActiveTeams: number;
  /** Credits spent this week ÷ weekly active teams. Null without the ledger or teams. */
  creditsPerActiveTeam: number | null;
  /** AI cost this week. Null when neither source reads. */
  aiCost: { usdThisWeek: number; perActiveTeamUsd: number | null; source: 'usage_log' | 'credit_ledger' } | null;
  /** Rollouts that went live in the last 7 days, and the 7 before. */
  liveRollouts: { current: number; previous: number };
  /** The Scoreboard's second-release rate over paying teams, copied through. */
  secondRelease: SecondReleaseSummary;
};

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** [from, to) for the week `back` weeks ago; the newest is open at the end like the cockpit's. */
export function weekWindow(nowMs: number, back: number): { fromMs: number; toMs: number } {
  return {
    fromMs: nowMs - (back + 1) * WEEK_MS,
    toMs: back === 0 ? Number.POSITIVE_INFINITY : nowMs - back * WEEK_MS,
  };
}

/** The ids of teams weekly active in a window (2+ members did something), and the paying ones among them. */
export function weeklyActiveTeamIds(
  input: ScoreboardInput,
  fromMs: number,
  toMs: number
): { all: Set<string>; paying: Set<string> } {
  const all = new Set<string>();
  const paying = new Set<string>();
  for (const team of input.teams) {
    const created = ms(team.createdAt);
    if (created !== null && created >= toMs) continue;
    if (activeMembersBetween(team.memberUserIds, input.activity, fromMs, toMs) < WEEKLY_ACTIVE_MIN_MEMBERS) continue;
    all.add(team.workspaceId);
    if (isPayingTeam(team, input.now)) paying.add(team.workspaceId);
  }
  return { all, paying };
}

/** Which team a usage or ledger row belongs to: its workspace if known, else the team its owner owns. */
export function teamResolver(teams: ScoreboardTeam[]) {
  const ids = new Set(teams.map((team) => team.workspaceId));
  const byOwner = new Map<string, string>();
  for (const team of teams) if (team.ownerUserId) byOwner.set(team.ownerUserId, team.workspaceId);
  return (row: { workspaceId: string | null; ownerUserId: string | null }): string | null => {
    if (row.workspaceId && ids.has(row.workspaceId)) return row.workspaceId;
    if (row.ownerUserId) return byOwner.get(row.ownerUserId) ?? null;
    return null;
  };
}

/** Choice 1: the share of weekly active paying teams that used UrgAns inside a release in [from, to). */
export function urgansShare(
  payingActive: Set<string>,
  usage: AiUsageRow[],
  resolveTeam: (row: AiUsageRow) => string | null,
  fromMs: number,
  toMs: number
): UrgansShare {
  const inReleases = new Set<string>();
  const anywhere = new Set<string>();
  for (const row of usage) {
    if (!URGANS_CHOSEN_FEATURES.has(row.feature)) continue;
    const at = ms(row.createdAt);
    if (at === null || at < fromMs || at >= toMs) continue;
    const team = resolveTeam(row);
    if (!team || !payingActive.has(team)) continue;
    anywhere.add(team);
    if (row.releaseId) inReleases.add(team);
  }
  return {
    activePayingTeams: payingActive.size,
    usingInReleases: inReleases.size,
    usingAnywhere: anywhere.size,
    rate: ratio(inReleases.size, payingActive.size),
  };
}

/** Choice 4: credits spent (spends minus refunds) in each of the last `weekCount` weeks, oldest first. */
export function creditsSpentByWeek(ledger: CreditLedgerRow[], nowMs: number, weekCount: number): CreditWeek[] {
  const weeks: CreditWeek[] = [];
  for (let back = weekCount - 1; back >= 0; back -= 1) {
    const { fromMs, toMs } = weekWindow(nowMs, back);
    let credits = 0;
    for (const row of ledger) {
      if (row.kind !== 'spend' && row.kind !== 'refund') continue;
      const at = ms(row.createdAt);
      if (at === null || at < fromMs || at >= toMs) continue;
      credits -= row.credits;
    }
    weeks.push({ endsAt: new Date(nowMs - back * WEEK_MS).toISOString(), credits: Math.max(0, credits) });
  }
  return weeks;
}

/** Choice 5: what the provider billed in [from, to), in RODI. Null calls add nothing. */
export function costRodiBetween(
  rows: Array<{ createdAt: string; cost: number | null }>,
  fromMs: number,
  toMs: number
): number {
  let total = 0;
  for (const row of rows) {
    if (row.cost === null || !Number.isFinite(row.cost)) continue;
    const at = ms(row.createdAt);
    if (at === null || at < fromMs || at >= toMs) continue;
    total += row.cost;
  }
  return total;
}

/** Choice 6: real rollouts whose live moment falls in [from, to). */
export function rolloutsLiveBetween(input: ScoreboardInput, fromMs: number, toMs: number): number {
  let count = 0;
  for (const release of input.releases) {
    if (release.isTest) continue;
    const live = releaseLiveAt(release, input.now);
    if (live !== null && live >= fromMs && live < toMs) count += 1;
  }
  return count;
}

export function buildUrgansUsage(
  input: ScoreboardInput,
  secondRelease: SecondReleaseSummary,
  usage: AiUsageRow[] | null,
  ledger: CreditLedgerRow[] | null,
  rodiPerUsd: number
): UrgansUsage {
  const nowMs = input.now.getTime();
  const thisWeek = weekWindow(nowMs, 0);
  const lastWeek = weekWindow(nowMs, 1);
  const activeNow = weeklyActiveTeamIds(input, thisWeek.fromMs, thisWeek.toMs);
  const activeBefore = weeklyActiveTeamIds(input, lastWeek.fromMs, lastWeek.toMs);
  const resolveTeam = teamResolver(input.teams);

  const share = usage
    ? {
        current: urgansShare(activeNow.paying, usage, resolveTeam, thisWeek.fromMs, thisWeek.toMs),
        previous: urgansShare(activeBefore.paying, usage, resolveTeam, lastWeek.fromMs, lastWeek.toMs),
      }
    : null;

  const creditWeeks = ledger ? creditsSpentByWeek(ledger, nowMs, CREDIT_WEEKS) : null;
  const creditsThisWeek = creditWeeks ? creditWeeks[creditWeeks.length - 1].credits : null;

  let aiCost: UrgansUsage['aiCost'] = null;
  const costSource = usage
    ? { rows: usage.map((row) => ({ createdAt: row.createdAt, cost: row.costRodi })), source: 'usage_log' as const }
    : ledger
      ? {
          rows: ledger
            .filter((row) => row.kind === 'spend')
            .map((row) => ({ createdAt: row.createdAt, cost: row.providerCostRodi })),
          source: 'credit_ledger' as const,
        }
      : null;
  if (costSource && rodiPerUsd > 0) {
    const usd = costRodiBetween(costSource.rows, thisWeek.fromMs, thisWeek.toMs) / rodiPerUsd;
    aiCost = { usdThisWeek: usd, perActiveTeamUsd: ratio(usd, activeNow.all.size), source: costSource.source };
  }

  return {
    target: URGANS_WEEKLY_TARGET,
    share,
    creditWeeks,
    weeklyActiveTeams: activeNow.all.size,
    creditsPerActiveTeam: creditsThisWeek === null ? null : ratio(creditsThisWeek, activeNow.all.size),
    aiCost,
    liveRollouts: {
      current: rolloutsLiveBetween(input, thisWeek.fromMs, nowMs + 1),
      previous: rolloutsLiveBetween(input, lastWeek.fromMs, lastWeek.toMs),
    },
    secondRelease,
  };
}
