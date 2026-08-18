import { describe, expect, it } from 'vitest';
import {
  TRIAL_CARD_PLAN,
  TRIAL_CARD_SOURCE,
  TRIAL_CARD_VERIFICATION_DISPLAY_NGN,
  TRIAL_DAYS,
  buildDelayedSubscriptionPayload,
  computeTrialEnd,
  extractReusableAuthorization,
  isCardTrialPlan,
  resolveCardTrialRequirement,
  resolveTrialVerificationKobo,
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
