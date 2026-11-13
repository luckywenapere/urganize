// The /admin/teams list on a computer (2026-11-12, #1241; founder approved the
// mock docs/mocks/admin-desktop/mock.html). Pure, so the page and its tests
// read one set of rules:
//  - the filter chips and the count on each (the four count tiles went),
//  - when "Mark paid" sits on the row rather than in the row's menu,
//  - when the "Past changes" box is worth showing.

export type TeamListRow = {
  state: string;
  comped: boolean;
  billingPlan: string | null;
};

export const TEAM_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'trial', label: 'On trial' },
  { value: 'paid', label: 'Paying' },
  { value: 'walled', label: 'Walled' },
  { value: 'read_only', label: 'Read only' },
  { value: 'comped', label: 'Comped' },
  { value: 'deal', label: 'Founding or custom' },
] as const;

export type TeamFilter = (typeof TEAM_FILTERS)[number]['value'];

/** The same rule the list always used: a deal is any team with a billing plan
 *  recorded, Comped is the comp flag, everything else is the access state. */
export function teamMatchesFilter(team: TeamListRow, filter: TeamFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'deal') return Boolean(team.billingPlan);
  if (filter === 'comped') return team.comped;
  return team.state === filter;
}

export function teamFilterCounts(teams: readonly TeamListRow[]): Record<TeamFilter, number> {
  const counts = Object.fromEntries(TEAM_FILTERS.map((option) => [option.value, 0])) as Record<TeamFilter, number>;
  for (const team of teams) {
    for (const option of TEAM_FILTERS) if (teamMatchesFilter(team, option.value)) counts[option.value] += 1;
  }
  return counts;
}

/**
 * A deal waiting on its invoice: a Founding Member or custom price was
 * recorded (billing_plan), and the team is not paying and not comped yet.
 * Only then is "Mark paid" the next thing to do, so only then is it on the
 * row; otherwise it stays in the row's menu.
 */
export function dealAwaitingPayment(team: TeamListRow): boolean {
  return Boolean(team.billingPlan) && team.state !== 'paid' && !team.comped;
}

/** The "Past changes" box shows only while some owner still has an email to get. */
export function showPastChanges(counts: { toSend: number } | null): boolean {
  return Boolean(counts && counts.toSend > 0);
}
