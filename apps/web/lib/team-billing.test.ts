import { describe, expect, it } from 'vitest';
import {
  HARD_PAYWALL_ANSWER_TTL_MS,
  TEAM_TRIAL_DAYS,
  TEAM_TRIAL_EXPIRY_GRACE_MS,
  TEAM_TRIAL_PILL_THRESHOLD_DAYS,
  combineTeamAccess,
  computeExtendedTrialEnd,
  computeTeamTrialDaysLeft,
  isHardPaywallGatedPath,
  resolveTeamAccess,
  resolveWallVariant,
  shouldConsultHardPaywallGate,
  type HardPaywallGateInput,
  type WorkspaceBillingFields,
} from './team-billing';

const NOW = new Date('2026-09-01T12:00:00.000Z');
const at = (offsetMs: number): string => new Date(NOW.getTime() + offsetMs).toISOString();
const DAY = 24 * 60 * 60 * 1000;

// A team mid-trial with no comp and no deal — the ordinary case.
const trialingTeam: WorkspaceBillingFields = {
  trialStartedAt: at(-4 * DAY),
  trialEndsAt: at(10 * DAY),
  compedAt: null,
  billingPlan: null,
  billingLockedAmount: null,
};

describe('team-billing constants', () => {
  it('pins the team trial at 14 days, distinct from the superseded card flow', () => {
    expect(TEAM_TRIAL_DAYS).toBe(14);
  });

  it('shows the indicator only inside the last 10 days', () => {
    expect(TEAM_TRIAL_PILL_THRESHOLD_DAYS).toBe(10);
    expect(TEAM_TRIAL_PILL_THRESHOLD_DAYS).toBeLessThan(TEAM_TRIAL_DAYS);
  });

  it('grace is 15 minutes — long enough for an in-flight save, short enough not to be a second trial', () => {
    expect(TEAM_TRIAL_EXPIRY_GRACE_MS).toBe(15 * 60 * 1000);
  });
});

describe('computeTeamTrialDaysLeft', () => {
  it('rounds up so a partial last day reads as 1, never 0', () => {
    expect(computeTeamTrialDaysLeft(at(DAY), NOW)).toBe(1);
    expect(computeTeamTrialDaysLeft(at(60 * 1000), NOW)).toBe(1);
  });

  it('counts a full trial and the pill threshold', () => {
    expect(computeTeamTrialDaysLeft(at(14 * DAY), NOW)).toBe(14);
    expect(computeTeamTrialDaysLeft(at(10 * DAY), NOW)).toBe(10);
  });

  it('is 0 for past, missing or unparseable ends', () => {
    expect(computeTeamTrialDaysLeft(at(-1), NOW)).toBe(0);
    expect(computeTeamTrialDaysLeft(null, NOW)).toBe(0);
    expect(computeTeamTrialDaysLeft('not-a-date', NOW)).toBe(0);
  });
});

// SPEC CASE 1 + 3: the expiry boundary, and mid-session expiry.
describe('resolveTeamAccess — trial expiry boundary and grace', () => {
  const expiring: WorkspaceBillingFields = { ...trialingTeam, trialEndsAt: NOW.toISOString() };

  it('one millisecond before the end is a live trial', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: expiring,
      now: new Date(NOW.getTime() - 1),
      graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
    });
    expect(result.state).toBe('trial');
    expect(result.hasAccess).toBe(true);
    expect(result.reason).toBe('trial_active');
  });

  it('one millisecond after the end still has access on the server, inside grace', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: expiring,
      now: new Date(NOW.getTime() + 1),
      graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
    });
    expect(result.state).toBe('grace');
    expect(result.hasAccess).toBe(true);
    expect(result.inGrace).toBe(true);
    expect(result.trialDaysLeft).toBe(0);
  });

  it('the same instant is already walled for a client, which passes no grace', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: expiring,
      now: new Date(NOW.getTime() + 1),
      graceMs: 0,
    });
    expect(result.state).toBe('walled');
    expect(result.hasAccess).toBe(false);
    expect(result.reason).toBe('trial_expired');
  });

  it('defaults to no grace when graceMs is omitted', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: expiring,
      now: new Date(NOW.getTime() + 1),
    });
    expect(result.state).toBe('walled');
  });

  it('walls once the grace window closes', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: expiring,
      now: new Date(NOW.getTime() + TEAM_TRIAL_EXPIRY_GRACE_MS + 1),
      graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
    });
    expect(result.state).toBe('walled');
    expect(result.hasAccess).toBe(false);
  });

  it('grace never applies to a team that simply never paid', () => {
    // A lapsed paid subscription resolves through ownerHasAccess=false with no
    // trial left; there is no in-flight work to protect and no grace to give.
    const longExpired: WorkspaceBillingFields = { ...trialingTeam, trialEndsAt: at(-30 * DAY) };
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: longExpired,
      now: NOW,
      graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
    });
    expect(result.state).toBe('walled');
  });
});

// SPEC CASE 2: comped bypass.
describe('resolveTeamAccess — comped', () => {
  const compedExpired: WorkspaceBillingFields = {
    ...trialingTeam,
    trialEndsAt: at(-30 * DAY),
    compedAt: at(-40 * DAY),
  };

  it('a comped team never walls, however long its trial has been over', () => {
    const result = resolveTeamAccess({ ownerHasAccess: false, team: compedExpired, now: NOW });
    expect(result.state).toBe('comped');
    expect(result.hasAccess).toBe(true);
    expect(result.reason).toBe('comped');
  });

  it('uncomping restores the wall for an expired trial', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: { ...compedExpired, compedAt: null },
      now: NOW,
    });
    expect(result.state).toBe('walled');
  });

  it('paid outranks comped, so a paying team reads as paid even with a stale comp', () => {
    const result = resolveTeamAccess({ ownerHasAccess: true, team: compedExpired, now: NOW });
    expect(result.state).toBe('paid');
    expect(result.reason).toBe('owner_paid');
  });

  it('comped outranks an active trial, so comping is visible immediately', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: { ...trialingTeam, compedAt: at(-1) },
      now: NOW,
    });
    expect(result.state).toBe('comped');
  });
});

// SPEC CASE 5: the states the migration backfill relies on.
describe('resolveTeamAccess — migration assignment matrix', () => {
  it('an owner with a paid subscription is paid regardless of trial dates', () => {
    for (const trialEndsAt of [null, at(-30 * DAY), at(5 * DAY)]) {
      const result = resolveTeamAccess({
        ownerHasAccess: true,
        team: { ...trialingTeam, trialEndsAt },
        now: NOW,
      });
      expect(result.state).toBe('paid');
    }
  });

  it('an allowlisted owner is paid, and is reported as such', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      ownerAllowlisted: true,
      team: { ...trialingTeam, trialEndsAt: at(-30 * DAY) },
      now: NOW,
    });
    expect(result.state).toBe('paid');
    expect(result.reason).toBe('owner_allowlisted');
  });

  it('a backfilled unpaid team is trialing with its full 14 days', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: { ...trialingTeam, trialStartedAt: NOW.toISOString(), trialEndsAt: at(14 * DAY) },
      now: NOW,
    });
    expect(result.state).toBe('trial');
    expect(result.trialDaysLeft).toBe(14);
  });

  it('an unstamped team fails OPEN rather than walling on our own bug', () => {
    const unstamped = resolveTeamAccess({
      ownerHasAccess: false,
      team: { ...trialingTeam, trialEndsAt: null },
      now: NOW,
      graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
    });
    expect(unstamped.hasAccess).toBe(true);
    expect(unstamped.reason).toBe('no_trial_stamp');

    const garbage = resolveTeamAccess({
      ownerHasAccess: false,
      team: { ...trialingTeam, trialEndsAt: 'not-a-date' },
      now: NOW,
    });
    expect(garbage.hasAccess).toBe(true);
    expect(garbage.reason).toBe('no_trial_stamp');
  });

  it('carries trialEndsAt through every state so the pill and wall can render it', () => {
    const result = resolveTeamAccess({ ownerHasAccess: false, team: trialingTeam, now: NOW });
    expect(result.trialEndsAt).toBe(trialingTeam.trialEndsAt);
    expect(result.trialDaysLeft).toBe(10);
  });
});

describe('combineTeamAccess', () => {
  it('an account with no teams yet passes — the gate runs before provisioning', () => {
    expect(combineTeamAccess({ own: null, foreign: [], ownReleaseCount: null })).toEqual({
      hasAccess: true,
      needsOwnReleaseCount: false,
    });
  });

  it('a teammate inherits access from the team that is not walled', () => {
    expect(
      combineTeamAccess({
        own: { state: 'walled' },
        foreign: [{ state: 'paid' }],
        ownReleaseCount: null,
      })
    ).toEqual({ hasAccess: true, needsOwnReleaseCount: false });
  });

  it('any unwalled foreign team is enough, even among walled ones', () => {
    expect(
      combineTeamAccess({
        own: null,
        foreign: [{ state: 'walled' }, { state: 'trial' }],
        ownReleaseCount: null,
      }).hasAccess
    ).toBe(true);
  });

  it('an owner with only their own team is judged on it alone', () => {
    expect(
      combineTeamAccess({ own: { state: 'trial' }, foreign: [], ownReleaseCount: null })
    ).toEqual({ hasAccess: true, needsOwnReleaseCount: false });
    expect(
      combineTeamAccess({ own: { state: 'walled' }, foreign: [], ownReleaseCount: null })
    ).toEqual({ hasAccess: false, needsOwnReleaseCount: false });
  });

  it('asks for the release count only in the ambiguous shell branch', () => {
    const ambiguous = combineTeamAccess({
      own: { state: 'trial' },
      foreign: [{ state: 'walled' }],
      ownReleaseCount: null,
    });
    expect(ambiguous).toEqual({ hasAccess: false, needsOwnReleaseCount: true });
  });

  it('an empty auto-provisioned shell cannot outlive the joined team wall', () => {
    expect(
      combineTeamAccess({
        own: { state: 'trial' },
        foreign: [{ state: 'walled' }],
        ownReleaseCount: 0,
      })
    ).toEqual({ hasAccess: false, needsOwnReleaseCount: false });
  });

  it('but a real second team of their own does grant access', () => {
    expect(
      combineTeamAccess({
        own: { state: 'trial' },
        foreign: [{ state: 'walled' }],
        ownReleaseCount: 3,
      })
    ).toEqual({ hasAccess: true, needsOwnReleaseCount: false });
  });

  it('walls when every team is walled', () => {
    expect(
      combineTeamAccess({
        own: { state: 'walled' },
        foreign: [{ state: 'walled' }, { state: 'walled' }],
        ownReleaseCount: 5,
      })
    ).toEqual({ hasAccess: false, needsOwnReleaseCount: false });
  });
});

// SPEC CASE 4: the non-owner wall view.
describe('resolveWallVariant', () => {
  it('the workspace owner sees payment actions', () => {
    expect(resolveWallVariant({ isWorkspaceOwner: true, membershipRole: 'member' })).toBe('owner');
  });

  it('an admin on the team sees payment actions too', () => {
    expect(resolveWallVariant({ isWorkspaceOwner: false, membershipRole: 'admin' })).toBe('owner');
    expect(resolveWallVariant({ isWorkspaceOwner: false, membershipRole: 'owner' })).toBe('owner');
    expect(resolveWallVariant({ isWorkspaceOwner: false, membershipRole: ' Admin ' })).toBe('owner');
  });

  it('members and guests are told their admin needs to act', () => {
    expect(resolveWallVariant({ isWorkspaceOwner: false, membershipRole: 'member' })).toBe('member');
    expect(resolveWallVariant({ isWorkspaceOwner: false, membershipRole: 'guest' })).toBe('member');
    expect(resolveWallVariant({ isWorkspaceOwner: false, membershipRole: null })).toBe('member');
  });
});

// SPEC CASE 6 (part): admin extend.
describe('computeExtendedTrialEnd', () => {
  it('adds days on top of a live trial rather than shortening it', () => {
    const result = computeExtendedTrialEnd(at(5 * DAY), 7, NOW);
    expect(result.toISOString()).toBe(at(12 * DAY));
  });

  it('extends a lapsed trial from today, so the days are real', () => {
    const result = computeExtendedTrialEnd(at(-30 * DAY), 14, NOW);
    expect(result.toISOString()).toBe(at(14 * DAY));
  });

  it('handles an unstamped or unparseable end by starting from now', () => {
    expect(computeExtendedTrialEnd(null, 14, NOW).toISOString()).toBe(at(14 * DAY));
    expect(computeExtendedTrialEnd('nonsense', 3, NOW).toISOString()).toBe(at(3 * DAY));
  });
});

describe('isHardPaywallGatedPath', () => {
  it('covers the chrome-bearing product surfaces', () => {
    expect(isHardPaywallGatedPath('/dashboard')).toBe(true);
    expect(isHardPaywallGatedPath('/dashboard/urgans')).toBe(true);
    expect(isHardPaywallGatedPath('/dashboard/notes')).toBe(true);
    expect(isHardPaywallGatedPath('/settings')).toBe(true);
  });

  it('never covers /admin — a walled founder must still be able to comp a team', () => {
    expect(isHardPaywallGatedPath('/admin')).toBe(false);
    expect(isHardPaywallGatedPath('/admin/teams')).toBe(false);
  });

  it('never covers the wall itself, the flow pages, the curator side or public links', () => {
    for (const path of [
      '/locked',
      '/auth',
      '/onboarding',
      '/payment/callback',
      '/redeem',
      '/invite/accept',
      '/join/abc',
      '/curator',
      '/epk/abc',
      '/credits/abc',
      '/capture/abc',
    ]) {
      expect(isHardPaywallGatedPath(path)).toBe(false);
    }
  });

  it('matches on path segments, not string prefixes', () => {
    expect(isHardPaywallGatedPath('/dashboards')).toBe(false);
    expect(isHardPaywallGatedPath('/settingsx')).toBe(false);
  });

  it('is false for nothing-values', () => {
    expect(isHardPaywallGatedPath(null)).toBe(false);
    expect(isHardPaywallGatedPath(undefined)).toBe(false);
    expect(isHardPaywallGatedPath('')).toBe(false);
    expect(isHardPaywallGatedPath('/')).toBe(false);
  });
});

describe('shouldConsultHardPaywallGate', () => {
  const consult: HardPaywallGateInput = {
    enabled: true,
    pathname: '/dashboard',
    isAuthLoading: false,
    isAuthenticated: true,
    userId: 'user-1',
    role: 'artist-manager',
    allowlisted: false,
    lastAnswer: null,
    now: NOW.getTime(),
  };

  it('consults in the ordinary case', () => {
    expect(shouldConsultHardPaywallGate(consult)).toBe(true);
  });

  it('flag off means the gate never speaks', () => {
    expect(shouldConsultHardPaywallGate({ ...consult, enabled: false })).toBe(false);
  });

  it('only on gated paths', () => {
    expect(shouldConsultHardPaywallGate({ ...consult, pathname: '/locked' })).toBe(false);
    expect(shouldConsultHardPaywallGate({ ...consult, pathname: '/admin/teams' })).toBe(false);
    expect(shouldConsultHardPaywallGate({ ...consult, pathname: null })).toBe(false);
  });

  it('waits for auth to resolve and needs a real user id', () => {
    expect(shouldConsultHardPaywallGate({ ...consult, isAuthLoading: true })).toBe(false);
    expect(shouldConsultHardPaywallGate({ ...consult, isAuthenticated: false })).toBe(false);
    expect(shouldConsultHardPaywallGate({ ...consult, userId: null })).toBe(false);
    expect(shouldConsultHardPaywallGate({ ...consult, userId: '   ' })).toBe(false);
  });

  it('skips curator-only accounts and allowlisted emails', () => {
    expect(shouldConsultHardPaywallGate({ ...consult, role: 'curator' })).toBe(false);
    expect(shouldConsultHardPaywallGate({ ...consult, role: ' Curator ' })).toBe(false);
    expect(shouldConsultHardPaywallGate({ ...consult, allowlisted: true })).toBe(false);
  });

  it('reuses a fresh answer, then re-asks once it goes stale — in both directions', () => {
    for (const walled of [true, false]) {
      const fresh = {
        ...consult,
        lastAnswer: { userId: 'user-1', walled, checkedAt: NOW.getTime() - 1_000 },
      };
      expect(shouldConsultHardPaywallGate(fresh)).toBe(false);

      const stale = {
        ...consult,
        lastAnswer: {
          userId: 'user-1',
          walled,
          checkedAt: NOW.getTime() - HARD_PAYWALL_ANSWER_TTL_MS - 1,
        },
      };
      expect(shouldConsultHardPaywallGate(stale)).toBe(true);
    }
  });

  it('never reuses another user answer after a same-tab account switch', () => {
    expect(
      shouldConsultHardPaywallGate({
        ...consult,
        lastAnswer: { userId: 'user-2', walled: false, checkedAt: NOW.getTime() },
      })
    ).toBe(true);
  });
});
