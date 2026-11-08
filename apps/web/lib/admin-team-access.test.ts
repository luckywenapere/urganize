import { describe, expect, it } from 'vitest';
import { resolveAdminTeamAccess } from './admin-team-access';

const now = new Date('2026-09-30T12:00:00Z');
const team = {
  trial_started_at: '2026-09-29T12:00:00Z',
  trial_ends_at: '2026-10-02T12:00:00Z',
  comped_at: null,
  billing_plan: null,
  billing_locked_amount: null,
};

describe('resolveAdminTeamAccess', () => {
  it('reads an active subscription inside its period as paid', () => {
    const result = resolveAdminTeamAccess({
      workspace: team,
      profile: { email: 'owner@example.com', is_subscribed: false, paid_at: '2026-09-01T00:00:00Z' },
      subscription: { status: 'active', expires_at: '2026-10-30T00:00:00Z' },
      now,
    });
    expect(result.subscriptionActive).toBe(true);
    expect(result.resolution).toMatchObject({ state: 'paid', reason: 'owner_paid' });
  });

  it('reads a team inside its trial dates as on a trial', () => {
    const result = resolveAdminTeamAccess({
      workspace: team,
      profile: { email: 'owner@example.com', is_subscribed: false, paid_at: null },
      subscription: null,
      now,
    });
    expect(result.resolution).toMatchObject({ state: 'trial', reason: 'trial_active' });
  });

  // Free plan (pricing v4, 2026-11-08): a never-paid team whose trial ran out
  // is on Free now, not walled.
  it('puts a team whose trial ran out and never paid on the Free plan', () => {
    const result = resolveAdminTeamAccess({
      workspace: { ...team, trial_ends_at: '2026-09-20T00:00:00Z' },
      profile: { email: 'owner@example.com', is_subscribed: false, paid_at: null },
      subscription: null,
      now,
    });
    expect(result.resolution.state).toBe('free');
  });

  it('does not count a subscription whose period has ended', () => {
    const result = resolveAdminTeamAccess({
      workspace: { ...team, trial_ends_at: '2026-09-20T00:00:00Z' },
      profile: { email: 'owner@example.com', is_subscribed: false, paid_at: '2026-08-01T00:00:00Z' },
      subscription: { status: 'active', expires_at: '2026-09-25T00:00:00Z' },
      now,
    });
    expect(result.subscriptionActive).toBe(false);
    expect(result.resolution.state).toBe('read_only');
  });

  it('marks an allowlisted owner as allowlisted rather than paying', () => {
    const result = resolveAdminTeamAccess({
      workspace: team,
      profile: { email: 'luckydio10@gmail.com', is_subscribed: false, paid_at: null },
      subscription: null,
      now,
    });
    expect(result.ownerAllowlisted).toBe(true);
    expect(result.resolution.reason).toBe('owner_allowlisted');
  });
});
