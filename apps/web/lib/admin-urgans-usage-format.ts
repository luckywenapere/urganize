import type { UrgansShare, UrgansUsage } from './admin-urgans-usage';

// How the cockpit's UrgAns panel reads as words. Client-safe: types only from
// ./admin-urgans-usage, so the counting rules stay out of the browser bundle.

const number = new Intl.NumberFormat('en');
const oneDecimal = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

/** "40%", rounded to a whole percent. Null reads "No data yet". */
export function formatPercent(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return 'No data yet';
  return `${Math.round(rate * 100)}%`;
}

/** The headline under the share: "2 of 5 active paying teams", or why there is no share. */
export function formatShareFact(share: UrgansShare): string {
  if (share.activePayingTeams === 0) return 'No paying team was active this week';
  return `${number.format(share.usingInReleases)} of ${number.format(share.activePayingTeams)} active paying ${
    share.activePayingTeams === 1 ? 'team' : 'teams'
  }`;
}

/** Against the strategy doc's bar: "At the target", "3 more teams to reach half", or nothing to say. */
export function formatTargetGap(share: UrgansShare, target: number): string | null {
  if (share.activePayingTeams === 0) return null;
  const needed = Math.ceil(share.activePayingTeams * target - 1e-9);
  const gap = needed - share.usingInReleases;
  if (gap <= 0) return 'At or above the target of half';
  return `${number.format(gap)} more ${gap === 1 ? 'team' : 'teams'} to reach half`;
}

/** "Last week: 1 of 4 (25%)", or "Last week: no paying team was active". */
export function formatLastWeekShare(share: UrgansShare): string {
  if (share.activePayingTeams === 0) return 'Last week: no paying team was active';
  return `Last week: ${number.format(share.usingInReleases)} of ${number.format(share.activePayingTeams)} (${formatPercent(share.rate)})`;
}

/** "12.5 credits", "1 credit"; null reads "Not tracked". */
export function formatCredits(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Not tracked';
  return `${oneDecimal.format(value)} ${value === 1 ? 'credit' : 'credits'}`;
}

/** Dollars with cents under $100, whole dollars above; null reads "Not tracked". */
export function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Not tracked';
  return value < 100 ? `$${value.toFixed(2)}` : `$${Math.round(value).toLocaleString('en')}`;
}

/** The fact under AI cost: total and where it came from. */
export function formatAiCostFact(usage: UrgansUsage): string | null {
  if (!usage.aiCost) return null;
  const from = usage.aiCost.source === 'usage_log' ? 'AI usage log' : 'credit ledger';
  if (usage.weeklyActiveTeams === 0) return `${formatUsd(usage.aiCost.usdThisWeek)} this week, no active team (${from})`;
  return `${formatUsd(usage.aiCost.usdThisWeek)} this week over ${number.format(usage.weeklyActiveTeams)} active ${
    usage.weeklyActiveTeams === 1 ? 'team' : 'teams'
  } (${from})`;
}

/** "Up 2 from 1 last week", "Down 1 from 3 last week", "Same as last week". */
export function formatLiveChange(current: number, previous: number): string {
  const delta = current - previous;
  if (delta === 0) return 'Same as last week';
  return `${delta > 0 ? 'Up' : 'Down'} ${number.format(Math.abs(delta))} from ${number.format(previous)} last week`;
}

/** The fact under the second-release rate: "2 of 3 teams, 1 still inside 90 days". */
export function formatSecondReleaseFact(summary: UrgansUsage['secondRelease']): string {
  const waiting =
    summary.waiting > 0 ? `${number.format(summary.waiting)} still inside ${summary.waiting === 1 ? 'its' : 'their'} 90 days` : '';
  if (summary.eligible === 0) {
    return waiting ? `No paying team is past 90 days yet; ${waiting}` : 'No paying team has had a rollout live yet';
  }
  const counted = `${number.format(summary.started)} of ${number.format(summary.eligible)} paying ${summary.eligible === 1 ? 'team' : 'teams'}`;
  return waiting ? `${counted}, ${waiting}` : counted;
}
