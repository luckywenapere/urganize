import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_SETUP_PATH,
  TRIAL_CARD_PLAN,
  TRIAL_CARD_SOURCE,
  TRIAL_CARD_VERIFICATION_DISPLAY_NGN,
  TRIAL_DAYS,
  buildDelayedSubscriptionPayload,
  computeTrialEnd,
  extractReusableAuthorization,
  isCardTrialGatedPath,
  isCardTrialPlan,
  resolveCardTrialDestination,
  resolveCardTrialRequirement,
  resolveTrialVerificationKobo,
  shouldConsultCardTrialGate,
  shouldRunAuthedOnboardingSetup,
  type CardTrialGateInput,
  type CardTrialRequirementInput,
} from './trial-card';

describe('trial-card constants', () => {
  it('pins the shared trial length at 28 days — /terms, the /pricing FAQ and the locked page all say 28', () => {
    expect(TRIAL_DAYS).toBe(28);
  });

  it('pins the payments sentinel so the webhook branch and the deletion carve-out cannot drift', () => {
    expect(TRIAL_CARD_PLAN).toBe('trial_card');
    expect(TRIAL_CARD_SOURCE).toBe('trial_card_checkout');
  });

  it('the sentinel is not a billing plan id — the recurring/legacy crediting paths must never match it', () => {
    expect(isCardTrialPlan(TRIAL_CARD_PLAN)).toBe(false);
  });

  it('display amount matches the documented default', () => {
    expect(TRIAL_CARD_VERIFICATION_DISPLAY_NGN).toBe(100);
  });
});

describe('computeTrialEnd', () => {
  it('adds exactly TRIAL_DAYS', () => {
    const now = new Date('2026-08-18T12:00:00.000Z');
    expect(computeTrialEnd(now).toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });
});

describe('resolveTrialVerificationKobo', () => {
  it('defaults to ₦100 (10000 kobo) when unset', () => {
    expect(resolveTrialVerificationKobo(undefined)).toBe(10000);
    expect(resolveTrialVerificationKobo('')).toBe(10000);
  });

  it('converts naira to kobo', () => {
    expect(resolveTrialVerificationKobo('250')).toBe(25000);
  });

  it('clamps positive values up to the ₦50 Paystack minimum', () => {
    expect(resolveTrialVerificationKobo('50')).toBe(5000);
    expect(resolveTrialVerificationKobo('49')).toBe(5000);
    expect(resolveTrialVerificationKobo('1')).toBe(5000);
  });

  it('falls back to the default (not the minimum) on garbage or non-positive input', () => {
    expect(resolveTrialVerificationKobo('abc')).toBe(10000);
    expect(resolveTrialVerificationKobo('-5')).toBe(10000);
    expect(resolveTrialVerificationKobo('0')).toBe(10000);
  });
});

describe('isCardTrialPlan', () => {
  it('accepts exactly the two self-serve recurring tiers', () => {
    expect(isCardTrialPlan('monthly')).toBe(true);
    expect(isCardTrialPlan('annual')).toBe(true);
  });

  it('rejects label (contactSales), legacy plans and junk', () => {
    expect(isCardTrialPlan('label')).toBe(false);
    expect(isCardTrialPlan('yearly')).toBe(false);
    expect(isCardTrialPlan('access')).toBe(false);
    expect(isCardTrialPlan('')).toBe(false);
    expect(isCardTrialPlan(null)).toBe(false);
    expect(isCardTrialPlan(undefined)).toBe(false);
  });
});

describe('extractReusableAuthorization', () => {
  const valid = {
    authorization_code: 'AUTH_abc123',
    signature: 'SIG_xyz',
    reusable: true,
    last4: '4081',
  };

  it('accepts a reusable authorization with a code', () => {
    const result = extractReusableAuthorization(valid);
    expect(result).not.toBeNull();
    expect(result?.authorizationCode).toBe('AUTH_abc123');
    expect(result?.signature).toBe('SIG_xyz');
    expect(result?.raw).toEqual(valid);
  });

  it('tolerates a missing signature (null, not empty string)', () => {
    const result = extractReusableAuthorization({
      authorization_code: 'AUTH_abc123',
      reusable: true,
    });
    expect(result?.signature).toBeNull();
  });

  it('rejects reusable:false — the card cannot be billed at trial end', () => {
    expect(extractReusableAuthorization({ ...valid, reusable: false })).toBeNull();
  });

  it('rejects a missing/absent reusable flag — only an explicit true counts', () => {
    expect(
      extractReusableAuthorization({ authorization_code: 'AUTH_abc123' })
    ).toBeNull();
  });

  it('rejects a missing or blank authorization_code', () => {
    expect(extractReusableAuthorization({ reusable: true })).toBeNull();
    expect(
      extractReusableAuthorization({ reusable: true, authorization_code: '  ' })
    ).toBeNull();
  });

  it('rejects non-objects', () => {
    expect(extractReusableAuthorization(null)).toBeNull();
    expect(extractReusableAuthorization(undefined)).toBeNull();
    expect(extractReusableAuthorization('AUTH_abc123')).toBeNull();
  });
});

describe('buildDelayedSubscriptionPayload', () => {
  it('builds the Paystack create-subscription body with an ISO start_date', () => {
    const payload = buildDelayedSubscriptionPayload({
      customerCode: 'CUS_1',
      planCode: 'PLN_1',
      authorizationCode: 'AUTH_1',
      startDate: new Date('2026-09-15T12:00:00.000Z'),
    });
    expect(payload).toEqual({
      customer: 'CUS_1',
      plan: 'PLN_1',
      authorization: 'AUTH_1',
      start_date: '2026-09-15T12:00:00.000Z',
    });
  });
});

describe('resolveCardTrialRequirement', () => {
  // The one shape that must return true: a brand-new, post-cutoff signup with
  // no access, no trial, no team membership and a normal role.
  const gated: CardTrialRequirementInput = {
    enabled: true,
    cutoffIso: '2026-08-20T00:00:00.000Z',
    createdAtIso: '2026-08-21T09:00:00.000Z',
    accountStatus: 'unpaid',
    trialUsed: false,
    hasAccess: false,
    role: 'artist-manager',
    isWorkspaceMember: false,
  };

  it('gates the one true case', () => {
    expect(resolveCardTrialRequirement(gated)).toBe(true);
  });

  it('created exactly at the cutoff counts as gated', () => {
    expect(
      resolveCardTrialRequirement({ ...gated, createdAtIso: gated.cutoffIso })
    ).toBe(true);
  });

  it('flag off → never', () => {
    expect(resolveCardTrialRequirement({ ...gated, enabled: false })).toBe(false);
  });

  it('no cutoff configured → inert (fail open for every existing account)', () => {
    expect(resolveCardTrialRequirement({ ...gated, cutoffIso: undefined })).toBe(false);
    expect(resolveCardTrialRequirement({ ...gated, cutoffIso: '' })).toBe(false);
    expect(resolveCardTrialRequirement({ ...gated, cutoffIso: 'not-a-date' })).toBe(false);
  });

  it('account created before the cutoff → never (the free-era carve-out)', () => {
    expect(
      resolveCardTrialRequirement({
        ...gated,
        createdAtIso: '2026-08-19T23:59:59.000Z',
      })
    ).toBe(false);
  });

  it('unknown created_at → fail open', () => {
    expect(resolveCardTrialRequirement({ ...gated, createdAtIso: null })).toBe(false);
    expect(resolveCardTrialRequirement({ ...gated, createdAtIso: 'garbage' })).toBe(false);
  });

  it('paid / trial / expired accounts → never', () => {
    expect(resolveCardTrialRequirement({ ...gated, accountStatus: 'paid' })).toBe(false);
    expect(resolveCardTrialRequirement({ ...gated, accountStatus: 'trial' })).toBe(false);
    expect(resolveCardTrialRequirement({ ...gated, accountStatus: 'expired' })).toBe(false);
    expect(resolveCardTrialRequirement({ ...gated, accountStatus: undefined })).toBe(false);
  });

  it('trial already used → never (that is /locked territory)', () => {
    expect(resolveCardTrialRequirement({ ...gated, trialUsed: true })).toBe(false);
    expect(resolveCardTrialRequirement({ ...gated, trialUsed: null })).toBe(false);
  });

  it('has access (incl. allowlist-as-paid) → never', () => {
    expect(resolveCardTrialRequirement({ ...gated, hasAccess: true })).toBe(false);
    expect(resolveCardTrialRequirement({ ...gated, hasAccess: null })).toBe(false);
  });

  it('curator-only accounts → never', () => {
    expect(resolveCardTrialRequirement({ ...gated, role: 'curator' })).toBe(false);
    expect(resolveCardTrialRequirement({ ...gated, role: ' Curator ' })).toBe(false);
  });

  it('invited teammates (active non-owner membership) → never', () => {
    expect(
      resolveCardTrialRequirement({ ...gated, isWorkspaceMember: true })
    ).toBe(false);
  });

  it('membership unknown (read failed) → fail open', () => {
    expect(
      resolveCardTrialRequirement({ ...gated, isWorkspaceMember: null })
    ).toBe(false);
  });
});

describe('isCardTrialGatedPath', () => {
  it('covers the three chrome-bearing app surfaces and their subpaths', () => {
    expect(isCardTrialGatedPath('/dashboard')).toBe(true);
    expect(isCardTrialGatedPath('/dashboard/urgans')).toBe(true);
    expect(isCardTrialGatedPath('/dashboard/notes')).toBe(true);
    expect(isCardTrialGatedPath('/settings')).toBe(true);
    expect(isCardTrialGatedPath('/admin')).toBe(true);
    expect(isCardTrialGatedPath('/admin/waitlist')).toBe(true);
  });

  it('never covers auth/billing surfaces — bouncing those would loop or eat a flow mid-step', () => {
    expect(isCardTrialGatedPath('/auth')).toBe(false);
    expect(isCardTrialGatedPath('/auth/callback')).toBe(false);
    expect(isCardTrialGatedPath('/onboarding')).toBe(false);
    expect(isCardTrialGatedPath('/start-trial')).toBe(false);
    expect(isCardTrialGatedPath('/locked')).toBe(false);
    expect(isCardTrialGatedPath('/payment/callback')).toBe(false);
    expect(isCardTrialGatedPath('/redeem')).toBe(false);
    expect(isCardTrialGatedPath('/invite/accept')).toBe(false);
  });

  it('never covers the free curator side or the public token pages', () => {
    expect(isCardTrialGatedPath('/curator')).toBe(false);
    expect(isCardTrialGatedPath('/curator/playlists')).toBe(false);
    expect(isCardTrialGatedPath('/epk/abc')).toBe(false);
    expect(isCardTrialGatedPath('/credits/abc')).toBe(false);
    expect(isCardTrialGatedPath('/capture/abc')).toBe(false);
  });

  it('prefix matching requires a real path segment, not a string prefix', () => {
    expect(isCardTrialGatedPath('/dashboards')).toBe(false);
    expect(isCardTrialGatedPath('/settingsx')).toBe(false);
    expect(isCardTrialGatedPath('/administration')).toBe(false);
  });

  it('fails closed on nothing-values', () => {
    expect(isCardTrialGatedPath(null)).toBe(false);
    expect(isCardTrialGatedPath(undefined)).toBe(false);
    expect(isCardTrialGatedPath('')).toBe(false);
    expect(isCardTrialGatedPath('/')).toBe(false);
  });
});

describe('shouldConsultCardTrialGate', () => {
  // The one shape that must consult the server: flag on, a signed-in
  // non-curator, non-allowlisted account on app chrome, with no settled
  // "not required" answer for this user yet.
  const consult: CardTrialGateInput = {
    enabled: true,
    pathname: '/dashboard',
    isAuthLoading: false,
    isAuthenticated: true,
    userId: 'user-1',
    role: 'artist-manager',
    allowlisted: false,
    lastAnswer: null,
  };

  it('consults in the one true case', () => {
    expect(shouldConsultCardTrialGate(consult)).toBe(true);
  });

  it('flag off → never (zero behavior change while the feature is dark)', () => {
    expect(shouldConsultCardTrialGate({ ...consult, enabled: false })).toBe(false);
  });

  it('only on gated chrome paths', () => {
    expect(
      shouldConsultCardTrialGate({ ...consult, pathname: '/start-trial' })
    ).toBe(false);
    expect(shouldConsultCardTrialGate({ ...consult, pathname: '/auth' })).toBe(false);
    expect(
      shouldConsultCardTrialGate({ ...consult, pathname: '/onboarding' })
    ).toBe(false);
    expect(shouldConsultCardTrialGate({ ...consult, pathname: null })).toBe(false);
  });

  it('waits for auth to RESOLVE and requires a signed-in user with an id', () => {
    expect(
      shouldConsultCardTrialGate({ ...consult, isAuthLoading: true })
    ).toBe(false);
    expect(
      shouldConsultCardTrialGate({ ...consult, isAuthenticated: false })
    ).toBe(false);
    expect(shouldConsultCardTrialGate({ ...consult, userId: null })).toBe(false);
    expect(shouldConsultCardTrialGate({ ...consult, userId: '  ' })).toBe(false);
  });

  it('curator-only accounts and allowlisted emails skip the round trip', () => {
    expect(shouldConsultCardTrialGate({ ...consult, role: 'curator' })).toBe(false);
    expect(shouldConsultCardTrialGate({ ...consult, role: ' Curator ' })).toBe(false);
    expect(shouldConsultCardTrialGate({ ...consult, allowlisted: true })).toBe(false);
  });

  it('a settled "not required" answer for THIS user ends the asking for the tab', () => {
    expect(
      shouldConsultCardTrialGate({
        ...consult,
        lastAnswer: { userId: 'user-1', required: false },
      })
    ).toBe(false);
  });

  it('a "required" answer keeps the gate live — checkout completion must clear without a reload', () => {
    expect(
      shouldConsultCardTrialGate({
        ...consult,
        lastAnswer: { userId: 'user-1', required: true },
      })
    ).toBe(true);
  });

  it('an answer for a DIFFERENT user never settles this one (same-tab logout→login)', () => {
    expect(
      shouldConsultCardTrialGate({
        ...consult,
        lastAnswer: { userId: 'user-2', required: false },
      })
    ).toBe(true);
  });
});

describe('resolveCardTrialDestination', () => {
  it('never-onboarded → the wizard, so the release and plan come before billing', () => {
    expect(resolveCardTrialDestination(false)).toBe(ONBOARDING_SETUP_PATH);
  });

  it('onboarded → billing (they already have their release)', () => {
    expect(resolveCardTrialDestination(true)).toBe('/start-trial');
  });

  it('unknown → billing, the destination this flow has always used', () => {
    expect(resolveCardTrialDestination(null)).toBe('/start-trial');
    expect(resolveCardTrialDestination(undefined)).toBe('/start-trial');
  });

  it('carries the setup marker the wizard keys on — without it onboarding bounces a signed-in user home', () => {
    expect(ONBOARDING_SETUP_PATH).toContain('setup=1');
  });
});

describe('shouldRunAuthedOnboardingSetup', () => {
  // The one shape that must serve the wizard to an already-signed-in account:
  // the marker param, the flag on, auth resolved, and onboarding genuinely
  // unfinished.
  const setup = {
    enabled: true,
    hasSetupParam: true,
    isAuthLoading: false,
    isAuthenticated: true,
    onboardingCompleted: false as boolean | null | undefined,
    role: 'artist-manager' as string | null | undefined,
  };

  it('runs in the one true case', () => {
    expect(shouldRunAuthedOnboardingSetup(setup)).toBe(true);
  });

  it('flag off → never (nothing routes anyone here with the param)', () => {
    expect(shouldRunAuthedOnboardingSetup({ ...setup, enabled: false })).toBe(false);
  });

  it('no marker param → never, so a normal /onboarding visit is untouched', () => {
    expect(shouldRunAuthedOnboardingSetup({ ...setup, hasSetupParam: false })).toBe(false);
  });

  it('waits for auth to RESOLVE, and needs a signed-in user', () => {
    expect(shouldRunAuthedOnboardingSetup({ ...setup, isAuthLoading: true })).toBe(false);
    expect(shouldRunAuthedOnboardingSetup({ ...setup, isAuthenticated: false })).toBe(false);
  });

  it('already onboarded → never: a stale link must not re-run the wizard', () => {
    expect(shouldRunAuthedOnboardingSetup({ ...setup, onboardingCompleted: true })).toBe(false);
  });

  it('unknown onboarding state → never (profile not loaded yet)', () => {
    expect(shouldRunAuthedOnboardingSetup({ ...setup, onboardingCompleted: null })).toBe(false);
    expect(
      shouldRunAuthedOnboardingSetup({ ...setup, onboardingCompleted: undefined })
    ).toBe(false);
  });

  it('curator-only accounts → never (no team side, no billing)', () => {
    expect(shouldRunAuthedOnboardingSetup({ ...setup, role: 'curator' })).toBe(false);
    expect(shouldRunAuthedOnboardingSetup({ ...setup, role: ' Curator ' })).toBe(false);
  });
});
