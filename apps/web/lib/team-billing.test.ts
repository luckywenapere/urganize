import { describe, expect, it } from 'vitest';
import {
  HARD_PAYWALL_ANSWER_TTL_MS,
  TEAM_TRIAL_DAYS,
  TEAM_TRIAL_EXPIRY_GRACE_MS,
  TEAM_TRIAL_PILL_THRESHOLD_DAYS,
  READ_ONLY_REACTIVATE_HREF,
  READ_ONLY_REFUSAL_CODE,
  READ_ONLY_REFUSAL_MESSAGE,
  READ_ONLY_REFUSAL_STATUS,
  combineTeamAccess,
  computeExtendedTrialEnd,
  computeTeamTrialDaysLeft,
  isHardPaywallGatedPath,
  isReadOnlySafeMethod,
  lapsedFromPayment,
  resolveTeamAccess,
  couldBeCreditsOnly,
  isFundedForAccess,
  resolveWallVariant,
  shouldConsultHardPaywallGate,
  type HardPaywallGateInput,
  type TeamAccessState,
  type WorkspaceBillingFields,
} from './team-billing';
import { ACCESS_REQUIRED_STATUS } from '@/app/api/_shared/paywall';

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
  it('pins the team trial at 3 days, distinct from the superseded card flow', () => {
    expect(TEAM_TRIAL_DAYS).toBe(3);
  });

  it('shows the indicator only on the trial\'s final day', () => {
    expect(TEAM_TRIAL_PILL_THRESHOLD_DAYS).toBe(1);
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

  it('a backfilled unpaid team is trialing with its full 3 days', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      team: { ...trialingTeam, trialStartedAt: NOW.toISOString(), trialEndsAt: at(TEAM_TRIAL_DAYS * DAY) },
      now: NOW,
    });
    expect(result.state).toBe('trial');
    expect(result.trialDaysLeft).toBe(TEAM_TRIAL_DAYS);
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
      canWrite: true,
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
    ).toEqual({ hasAccess: true, canWrite: true, needsOwnReleaseCount: false });
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
    ).toEqual({ hasAccess: true, canWrite: true, needsOwnReleaseCount: false });
    expect(
      combineTeamAccess({ own: { state: 'walled' }, foreign: [], ownReleaseCount: null })
    ).toEqual({ hasAccess: false, canWrite: false, needsOwnReleaseCount: false });
  });

  it('asks for the release count only in the ambiguous shell branch', () => {
    const ambiguous = combineTeamAccess({
      own: { state: 'trial' },
      foreign: [{ state: 'walled' }],
      ownReleaseCount: null,
    });
    expect(ambiguous).toEqual({
      hasAccess: false,
      canWrite: false,
      needsOwnReleaseCount: true,
    });
  });

  it('an empty auto-provisioned shell cannot outlive the joined team wall', () => {
    expect(
      combineTeamAccess({
        own: { state: 'trial' },
        foreign: [{ state: 'walled' }],
        ownReleaseCount: 0,
      })
    ).toEqual({ hasAccess: false, canWrite: false, needsOwnReleaseCount: false });
  });

  it('but a real second team of their own does grant access', () => {
    expect(
      combineTeamAccess({
        own: { state: 'trial' },
        foreign: [{ state: 'walled' }],
        ownReleaseCount: 3,
      })
    ).toEqual({ hasAccess: true, canWrite: true, needsOwnReleaseCount: false });
  });

  it('walls when every team is walled', () => {
    expect(
      combineTeamAccess({
        own: { state: 'walled' },
        foreign: [{ state: 'walled' }, { state: 'walled' }],
        ownReleaseCount: 5,
      })
    ).toEqual({ hasAccess: false, canWrite: false, needsOwnReleaseCount: false });
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

// ---------------------------------------------------------------------------
// Read-only mode (payment failure, 2026-08-24)
// ---------------------------------------------------------------------------

/** A team well past its trial: the state where the read-only/wall fork happens. */
const lapsedTeam: WorkspaceBillingFields = {
  trialStartedAt: at(-40 * DAY),
  trialEndsAt: at(-26 * DAY),
  compedAt: null,
  billingPlan: null,
  billingLockedAmount: null,
};

describe('lapsedFromPayment', () => {
  it('is true only when the owner has no access AND real money once landed', () => {
    expect(lapsedFromPayment({ ownerHasAccess: false, ownerPaidAt: at(-90 * DAY) })).toBe(true);
  });

  it('is false for a team that never paid — trial expiry keeps the wall', () => {
    // This is the founder's line, and it is the whole reason paid_at is the
    // discriminator rather than subscriptions.status: a cancelled card-trial
    // wears status 'cancelled' and never paid a penny.
    expect(lapsedFromPayment({ ownerHasAccess: false, ownerPaidAt: null })).toBe(false);
  });

  it('is false while the owner still has access, however they got it', () => {
    expect(lapsedFromPayment({ ownerHasAccess: true, ownerPaidAt: at(-90 * DAY) })).toBe(false);
  });
});

describe('resolveTeamAccess — read-only', () => {
  const readOnly = () =>
    resolveTeamAccess({
      ownerHasAccess: false,
      ownerLapsedFromPayment: true,
      team: lapsedTeam,
      now: NOW,
      graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
    });

  it('a lapsed PAYER reads everything and writes nothing', () => {
    const resolution = readOnly();
    expect(resolution.state).toBe('read_only');
    expect(resolution.reason).toBe('payment_failed');
    // hasAccess TRUE is what stops the wall being drawn. If this ever flips,
    // HardPaywallGate redirects them to /locked and the feature is gone.
    expect(resolution.hasAccess).toBe(true);
    expect(resolution.canWrite).toBe(false);
    expect(resolution.inGrace).toBe(false);
  });

  it('a lapsed TRIALIST still hits the wall', () => {
    const resolution = resolveTeamAccess({
      ownerHasAccess: false,
      ownerLapsedFromPayment: false,
      team: lapsedTeam,
      now: NOW,
      graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
    });
    expect(resolution.state).toBe('walled');
    expect(resolution.hasAccess).toBe(false);
    expect(resolution.canWrite).toBe(false);
  });

  it('omitting the input behaves exactly as before this feature existed', () => {
    const resolution = resolveTeamAccess({
      ownerHasAccess: false,
      team: lapsedTeam,
      now: NOW,
    });
    expect(resolution.state).toBe('walled');
  });

  it('every state that grants access grants writes, except read-only', () => {
    const grantsAccess: Array<[TeamAccessState, ReturnType<typeof resolveTeamAccess>]> = [
      [
        'paid',
        resolveTeamAccess({
          ownerHasAccess: true,
          ownerLapsedFromPayment: true,
          team: lapsedTeam,
          now: NOW,
        }),
      ],
      [
        'comped',
        resolveTeamAccess({
          ownerHasAccess: false,
          ownerLapsedFromPayment: true,
          team: { ...lapsedTeam, compedAt: at(-DAY) },
          now: NOW,
        }),
      ],
      [
        'trial',
        resolveTeamAccess({
          ownerHasAccess: false,
          ownerLapsedFromPayment: true,
          team: trialingTeam,
          now: NOW,
        }),
      ],
      [
        'grace',
        resolveTeamAccess({
          ownerHasAccess: false,
          ownerLapsedFromPayment: true,
          team: { ...lapsedTeam, trialEndsAt: at(-60 * 1000) },
          now: NOW,
          graceMs: TEAM_TRIAL_EXPIRY_GRACE_MS,
        }),
      ],
    ];
    for (const [expectedState, resolution] of grantsAccess) {
      expect(resolution.state).toBe(expectedState);
      expect(resolution.hasAccess).toBe(true);
      expect(resolution.canWrite).toBe(true);
    }
  });

  it('an unstamped trial still fails OPEN even for a lapsed payer', () => {
    // Fail-open is strictly more generous than read-only, so it stays above it
    // in the precedence order: our missing backfill must never cost a customer
    // their writes.
    const resolution = resolveTeamAccess({
      ownerHasAccess: false,
      ownerLapsedFromPayment: true,
      team: { ...lapsedTeam, trialEndsAt: null },
      now: NOW,
    });
    expect(resolution.state).toBe('trial');
    expect(resolution.reason).toBe('no_trial_stamp');
    expect(resolution.canWrite).toBe(true);
  });
});

describe('combineTeamAccess — the write axis', () => {
  it('read-only grants reads across teams but never writes', () => {
    expect(
      combineTeamAccess({
        own: { state: 'walled' },
        foreign: [{ state: 'read_only' }],
        ownReleaseCount: null,
      })
    ).toEqual({ hasAccess: true, canWrite: false, needsOwnReleaseCount: false });
  });

  it('a teammate cannot write through their own empty trial shell', () => {
    // The shell rule has to keep holding on the write axis, or every teammate of
    // a read-only team would keep writing via the workspace provisioning handed
    // them — the same hole combineTeamAccess exists to close for the wall.
    expect(
      combineTeamAccess({
        own: { state: 'trial' },
        foreign: [{ state: 'read_only' }],
        ownReleaseCount: 0,
      })
    ).toEqual({ hasAccess: true, canWrite: false, needsOwnReleaseCount: false });
  });

  it('but a paying team elsewhere restores writes', () => {
    expect(
      combineTeamAccess({
        own: { state: 'read_only' },
        foreign: [{ state: 'paid' }],
        ownReleaseCount: null,
      })
    ).toEqual({ hasAccess: true, canWrite: true, needsOwnReleaseCount: false });
  });

  it('an owner of only a read-only team is read-only', () => {
    expect(
      combineTeamAccess({ own: { state: 'read_only' }, foreign: [], ownReleaseCount: null })
    ).toEqual({ hasAccess: true, canWrite: false, needsOwnReleaseCount: false });
  });

  it('never grants a write without a read', () => {
    const states: TeamAccessState[] = ['paid', 'comped', 'trial', 'grace', 'read_only', 'walled'];
    for (const own of states) {
      for (const other of states) {
        for (const count of [null, 0, 4]) {
          const combined = combineTeamAccess({
            own: { state: own },
            foreign: [{ state: other }],
            ownReleaseCount: count,
          });
          if (combined.canWrite) expect(combined.hasAccess).toBe(true);
        }
      }
    }
  });
});

describe('isReadOnlySafeMethod', () => {
  it('lets reads through, case-insensitively', () => {
    for (const method of ['GET', 'get', 'HEAD', ' head ', 'OPTIONS']) {
      expect(isReadOnlySafeMethod(method)).toBe(true);
    }
  });

  it('refuses every write method', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE', 'post']) {
      expect(isReadOnlySafeMethod(method)).toBe(false);
    }
  });

  it('treats an absent or unknown method as a write', () => {
    // Every route-level caller that cannot name its method is a mutation route,
    // so this is the safe reading rather than a convenience.
    for (const method of [null, undefined, '', 'TRACE']) {
      expect(isReadOnlySafeMethod(method)).toBe(false);
    }
  });
});

describe('the read-only refusal', () => {
  it('is NOT 402, which would eject the team from the app', () => {
    // lib/access-redirect.ts patches window.fetch and redirects the browser to
    // /locked on ANY same-origin 402. A 402 here would therefore throw a
    // read-only team out of the app on their first blocked save, which is
    // exactly the wall this mode replaces. 403 is the whole point.
    expect(READ_ONLY_REFUSAL_STATUS).toBe(403);
    expect(READ_ONLY_REFUSAL_STATUS).not.toBe(ACCESS_REQUIRED_STATUS);
  });

  it('has a stable machine marker and a reactivation door that survives /locked', () => {
    expect(READ_ONLY_REFUSAL_CODE).toBe('READ_ONLY');
    // /locked bounces anyone who HAS access straight back into the app, and a
    // read-only team has access, so a bare /locked link is a dead end.
    expect(READ_ONLY_REACTIVATE_HREF).toContain('intent=reactivate');
  });

  it('says what happened and who can fix it, without threatening anything', () => {
    for (const message of Object.values(READ_ONLY_REFUSAL_MESSAGE)) {
      expect(message).toContain('read only');
      // House copy rules.
      expect(message).not.toContain('—');
      // Nothing is being taken away: reads still work and nothing is deleted.
      expect(message).not.toMatch(/lose|deleted|removed|permanently/i);
    }
    expect(READ_ONLY_REFUSAL_MESSAGE.owner).toMatch(/update your payment/i);
    expect(READ_ONLY_REFUSAL_MESSAGE.member).toMatch(/team admin/i);
  });
});

describe('credits-only access (2026-10-02)', () => {
  const ended = {
    trialStartedAt: '2026-08-01T00:00:00.000Z',
    trialEndsAt: '2026-08-04T00:00:00.000Z',
    compedAt: null,
    billingPlan: null,
    billingLockedAmount: null,
  };
  const now = new Date('2026-10-02T12:00:00.000Z');

  it('opens the app to a team whose trial ended, while it holds credits', () => {
    const result = resolveTeamAccess({ ownerHasAccess: false, team: ended, now, creditsFunded: true });
    expect(result).toMatchObject({ state: 'credits_only', hasAccess: true, canWrite: true, reason: 'credits_funded' });
  });

  it('turns a lapsed plan with credits into credits-only, so it can still write', () => {
    const result = resolveTeamAccess({
      ownerHasAccess: false,
      ownerLapsedFromPayment: true,
      team: ended,
      now,
      creditsFunded: true,
    });
    expect(result.state).toBe('credits_only');
    expect(result.canWrite).toBe(true);
  });

  it('falls back to the wall, or read-only, with no credits', () => {
    expect(resolveTeamAccess({ ownerHasAccess: false, team: ended, now }).state).toBe('walled');
    expect(resolveTeamAccess({ ownerHasAccess: false, team: ended, now, creditsFunded: false }).state).toBe('walled');
    expect(
      resolveTeamAccess({ ownerHasAccess: false, ownerLapsedFromPayment: true, team: ended, now }).state
    ).toBe('read_only');
  });

  it('never narrows a paid, comped or trialing team to credits-only', () => {
    expect(resolveTeamAccess({ ownerHasAccess: true, team: ended, now, creditsFunded: true }).state).toBe('paid');
    expect(
      resolveTeamAccess({ ownerHasAccess: false, team: { ...ended, compedAt: '2026-09-01T00:00:00.000Z' }, now, creditsFunded: true }).state
    ).toBe('comped');
    expect(
      resolveTeamAccess({
        ownerHasAccess: false,
        team: { ...ended, trialEndsAt: '2026-10-05T00:00:00.000Z' },
        now,
        creditsFunded: true,
      }).state
    ).toBe('trial');
  });

  it('counts bought and monthly credits for access, never trial credits, and an unreadable balance as none', () => {
    expect(isFundedForAccess({ allowance: 0, topup: 5 })).toBe(true);
    expect(isFundedForAccess({ allowance: 3, topup: 0 })).toBe(true);
    expect(isFundedForAccess({ allowance: 0, topup: 0, trial: 50 } as { allowance: number; topup: number })).toBe(false);
    expect(isFundedForAccess({ allowance: 0, topup: 0 })).toBe(false);
    expect(isFundedForAccess({ allowance: -2, topup: 1 })).toBe(false);
    expect(isFundedForAccess(null)).toBe(false);
    expect(isFundedForAccess(undefined)).toBe(false);
  });

  it('only asks for a balance when the answer would otherwise be the wall or read-only', () => {
    expect(couldBeCreditsOnly('walled')).toBe(true);
    expect(couldBeCreditsOnly('read_only')).toBe(true);
    for (const state of ['paid', 'comped', 'trial', 'grace', 'credits_only'] as const) {
      expect(couldBeCreditsOnly(state), state).toBe(false);
    }
  });

  it('grants a credits-only team through combineTeamAccess, for a teammate too', () => {
    expect(combineTeamAccess({ own: { state: 'credits_only' }, foreign: [], ownReleaseCount: null })).toMatchObject({
      hasAccess: true,
      canWrite: true,
    });
    expect(
      combineTeamAccess({ own: { state: 'walled' }, foreign: [{ state: 'credits_only' }], ownReleaseCount: null })
    ).toMatchObject({ hasAccess: true, canWrite: true });
  });
});
