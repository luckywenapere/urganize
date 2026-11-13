import { describe, expect, it } from 'vitest';
import { TEAM_FILTERS, dealAwaitingPayment, showPastChanges, teamFilterCounts, teamMatchesFilter } from './admin-teams-list';

// /admin/teams on a computer (2026-11-12, #1241).

const team = (over: Partial<{ state: string; comped: boolean; billingPlan: string | null }> = {}) => ({
  state: 'trial',
  comped: false,
  billingPlan: null,
  ...over,
});

describe('the team filters', () => {
  it('keeps the filters the page always had, in chip order', () => {
    expect(TEAM_FILTERS.map((option) => option.label)).toEqual([
      'All',
      'On trial',
      'Paying',
      'Walled',
      'Read only',
      'Comped',
      'Founding or custom',
    ]);
  });

  it('matches on state, the comp flag, or a recorded deal', () => {
    expect(teamMatchesFilter(team(), 'all')).toBe(true);
    expect(teamMatchesFilter(team(), 'trial')).toBe(true);
    expect(teamMatchesFilter(team(), 'paid')).toBe(false);
    expect(teamMatchesFilter(team({ comped: true, state: 'comped' }), 'comped')).toBe(true);
    expect(teamMatchesFilter(team({ billingPlan: 'founding' }), 'deal')).toBe(true);
    expect(teamMatchesFilter(team(), 'deal')).toBe(false);
  });

  it('counts every chip from the rows', () => {
    const counts = teamFilterCounts([
      team(),
      team(),
      team({ state: 'paid', billingPlan: 'custom' }),
      team({ state: 'walled' }),
      team({ state: 'read_only' }),
      team({ state: 'comped', comped: true }),
    ]);
    expect(counts).toEqual({ all: 6, trial: 2, paid: 1, walled: 1, read_only: 1, comped: 1, deal: 1 });
  });
});

describe('Mark paid on the row', () => {
  it('only for a recorded deal that is not paying or comped yet', () => {
    expect(dealAwaitingPayment(team({ billingPlan: 'founding' }))).toBe(true);
    expect(dealAwaitingPayment(team({ billingPlan: 'custom', state: 'walled' }))).toBe(true);
    expect(dealAwaitingPayment(team({ billingPlan: 'custom', state: 'paid' }))).toBe(false);
    expect(dealAwaitingPayment(team({ billingPlan: 'founding', comped: true }))).toBe(false);
    expect(dealAwaitingPayment(team())).toBe(false);
  });
});

describe('the Past changes box', () => {
  it('shows only while an owner still has an email to get', () => {
    expect(showPastChanges(null)).toBe(false);
    expect(showPastChanges({ toSend: 0 })).toBe(false);
    expect(showPastChanges({ toSend: 3 })).toBe(true);
  });
});
