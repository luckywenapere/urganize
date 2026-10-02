import type { Scoreboard } from './scoreboard';

// How the scoreboard reads as words. Kept apart from ./scoreboard.ts so the
// admin page can import it without pulling the counting rules (and the billing
// helpers they use) into the browser. Types only from there.

const wholeNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

/** "₦22,000" from kobo. */
export function formatNaira(minor: number): string {
  return `₦${wholeNumber.format(Math.round(minor / 100))}`;
}

/** "63%", or "not enough data yet" when there is nothing to divide by. */
export function formatRate(rate: number | null): string {
  return rate === null ? 'not enough data yet' : `${Math.round(rate * 100)}%`;
}

/**
 * The Friday post (doc section 2: "KB posts the numbers to the team group
 * every Friday"). Plain lines, no formatting, because it is pasted into a
 * WhatsApp group.
 */
export function formatScoreboardForTeamGroup(board: Scoreboard): string {
  const latestCohort = board.retention[0];
  const lines = [
    `Urganize scoreboard, ${board.generatedAt.slice(0, 10)}`,
    `Weekly active paying teams: ${board.weeklyActivePayingTeams} (of ${board.payingTeams} paying)`,
    `MRR: ${formatNaira(board.mrrMinor)}`,
    `Second-release rate: ${formatRate(board.secondRelease.rate)}` +
      (board.secondRelease.eligible > 0
        ? ` (${board.secondRelease.started} of ${board.secondRelease.eligible})`
        : ''),
    `Week 4 retention: ${
      latestCohort
        ? `${formatRate(latestCohort.rate)} (teams from the week of ${latestCohort.weekStart})`
        : 'not enough data yet'
    }`,
    `Active teams, paid or not, last 30 days: ${board.activeTeams30d}`,
    `Weekly active teams, paid or not: ${board.weeklyActiveTeams}`,
    `Trial to paid, last 90 days: ${formatRate(board.trialToPaid.rate)}` +
      (board.trialToPaid.ended > 0 ? ` (${board.trialToPaid.paid} of ${board.trialToPaid.ended})` : ''),
    `Activation, last 30 days: ${formatRate(board.activation.rate)}` +
      (board.activation.signups > 0
        ? ` (${board.activation.activated} of ${board.activation.signups})`
        : ''),
  ];
  if (board.activityTruncated) {
    lines.push('Note: activity hit its read limit, so the activity numbers are a floor.');
  }
  return lines.join('\n');
}
