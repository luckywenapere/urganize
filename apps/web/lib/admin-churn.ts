import {
  isCurrentSubscription,
  isTeamPlan,
  monthlyAmountMinor,
  type ScoreboardInput,
  type ScoreboardSubscription,
} from './scoreboard';
import { NOT_TRACKED_NET } from './admin-churn-format';

// Churn and revenue retention on the founder cockpit (iteration 5, 2026-10-10).
//
// PURE, like ./scoreboard.ts: no database, no clock, no environment. It takes
// the Scoreboard's own input, so "paying team" and "MRR" mean exactly what they
// mean there (strategy doc sections 2 and 7).
//
// WHAT IS STORED, AND SO WHAT CAN BE COUNTED. Urganize keeps one subscriptions
// row per account and overwrites it. For each row we know:
//   - started_at: when the current run of paying began (the first charge or a
//     "Mark paid" sets it; renewals leave it alone),
//   - expires_at: the last paid day,
//   - the price today.
// So each subscription gives one stretch of paying, from started_at to the
// moment it stopped being current (its expires_at once that has passed), or to
// now if it is still current. From those stretches:
//
//   Logo churn for a month = paying teams lost in the month / paying teams at
//     the start of the month. "Paying team" is the Scoreboard's rule (any plan
//     but Solo, not comped, not on the allowlist).
//   Gross MRR churn for a month = MRR of the subscriptions that stopped in the
//     month / MRR at the start of the month. Every paid subscription counts,
//     Solo included, as in MRR.
//
// WHAT IS NOT STORED, so it is reported as not tracked, never estimated:
//   - Upgrades and downgrades. A plan change overwrites the price, so the MRR a
//     team added or lost by changing plan inside a month is gone. Net MRR churn
//     and net revenue retention need exactly that, so both are null with a
//     reason (NOT_TRACKED_NET in ./admin-churn-format.ts, with the benchmarks).
//   - A team that stopped and later paid again. Its row was overwritten by the
//     new run, so the earlier loss is invisible. Lost counts are therefore "at
//     least" numbers.
// Because each start-of-month MRR uses today's price, a team that changed plan
// since is counted at its new price. The page says so.

/** Complete calendar months shown, plus the month so far. */
export const CHURN_COMPLETE_MONTHS = 3;

export type ChurnMonth = {
  /** "2026-09". UTC calendar month, like every board date. */
  month: string;
  startsAt: string;
  endsAt: string;
  /** False for the month so far. */
  complete: boolean;
  payingTeamsAtStart: number;
  teamsLost: number;
  /** teamsLost / payingTeamsAtStart, or null when nobody was paying. */
  logoChurn: number | null;
  mrrAtStartMinor: number;
  mrrLostMinor: number;
  /** mrrLostMinor / mrrAtStartMinor, or null when the start was zero. */
  grossMrrChurn: number | null;
};

export type ChurnSummary = {
  /** Oldest first: CHURN_COMPLETE_MONTHS complete months, then this month so far. */
  months: ChurnMonth[];
  /** Paid subscriptions left out because a date they need is not stored
   *  (no started_at, or stopped early with no date). */
  undated: number;
  /** Always null today, see NOT_TRACKED_NET. */
  netMrrChurn: null;
  netRevenueRetention: null;
  netNotTrackedReason: string;
};

/** One stretch of paying. `until` is null while it is still current. */
export type PayingStretch = { from: number; until: number | null; monthlyMinor: number };

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

/**
 * When this subscription was paying, or null when it never was (no money, the
 * retired card trial) or a date is not stored. `'undated'` marks a paid row we
 * cannot place in time.
 */
export function payingStretch(
  sub: ScoreboardSubscription,
  now: Date
): PayingStretch | 'undated' | null {
  if (!sub.amountMinor || sub.amountMinor <= 0) return null;
  if (String(sub.status) === 'trialing') return null;
  const from = ms(sub.startedAt);
  const monthlyMinor = monthlyAmountMinor(sub);
  if (isCurrentSubscription(sub, now)) {
    return from === null ? 'undated' : { from, until: null, monthlyMinor };
  }
  const expires = ms(sub.expiresAt);
  // Not current but paid up to a future date (refunded, or ended by hand): when
  // it stopped is not stored.
  if (expires === null || expires > now.getTime()) return 'undated';
  if (from === null) return 'undated';
  if (expires <= from) return null;
  return { from, until: expires, monthlyMinor };
}

/** Month starts, oldest first: `count` complete months, then the current one. */
export function monthStarts(now: Date, count: number): number[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const out: number[] = [];
  // Date.UTC with a negative month rolls the year back correctly; never shift
  // a date with setUTCMonth, which skips February on the 31st.
  for (let back = count; back >= 0; back -= 1) out.push(Date.UTC(y, m - back, 1));
  return out;
}

function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function monthLabel(start: number): string {
  return new Date(start).toISOString().slice(0, 7);
}

function payingAt(stretch: PayingStretch, at: number): boolean {
  return stretch.from < at && (stretch.until === null || stretch.until > at);
}

function lostIn(stretch: PayingStretch, start: number, end: number): boolean {
  return stretch.until !== null && stretch.until >= start && stretch.until < end;
}

export function churnSummary(input: ScoreboardInput, completeMonths = CHURN_COMPLETE_MONTHS): ChurnSummary {
  const nowMs = input.now.getTime();
  let undated = 0;

  // Teams: the Scoreboard's paying-team rule, applied to each team's stretch.
  const teamStretches: PayingStretch[] = [];
  for (const team of input.teams) {
    if (team.comped || team.allowlisted || !team.subscription) continue;
    if (!isTeamPlan(team.subscription.plan)) continue;
    const stretch = payingStretch(team.subscription, input.now);
    if (stretch && stretch !== 'undated') teamStretches.push(stretch);
  }

  // Money: every subscription, Solo included, as MRR counts it.
  const moneyStretches: PayingStretch[] = [];
  for (const sub of input.subscriptions) {
    const stretch = payingStretch(sub, input.now);
    if (stretch === 'undated') undated += 1;
    else if (stretch) moneyStretches.push(stretch);
  }

  const starts = monthStarts(input.now, completeMonths);
  const months: ChurnMonth[] = starts.map((start, index) => {
    const nextStart = index + 1 < starts.length ? starts[index + 1] : null;
    const complete = nextStart !== null;
    const end = nextStart ?? nowMs + 1;
    const payingTeams = teamStretches.filter((s) => payingAt(s, start));
    const teamsLost = payingTeams.filter((s) => lostIn(s, start, end)).length;
    const payingMoney = moneyStretches.filter((s) => payingAt(s, start));
    const mrrAtStartMinor = payingMoney.reduce((sum, s) => sum + s.monthlyMinor, 0);
    const mrrLostMinor = payingMoney
      .filter((s) => lostIn(s, start, end))
      .reduce((sum, s) => sum + s.monthlyMinor, 0);
    return {
      month: monthLabel(start),
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(complete ? end : nowMs).toISOString(),
      complete,
      payingTeamsAtStart: payingTeams.length,
      teamsLost,
      logoChurn: ratio(teamsLost, payingTeams.length),
      mrrAtStartMinor,
      mrrLostMinor,
      grossMrrChurn: ratio(mrrLostMinor, mrrAtStartMinor),
    };
  });

  return {
    months,
    undated,
    netMrrChurn: null,
    netRevenueRetention: null,
    netNotTrackedReason: NOT_TRACKED_NET,
  };
}
