import { describe, expect, it } from 'vitest';
import {
  applyLifetimeLicense,
  decodeClaimCookie,
  encodeClaimCookie,
  hasLiveCardPlan,
  nextLicenseStatus,
  planCoversLifetime,
  parseDayzeroWebhook,
  signDayzeroPayload,
  verifyDayzeroSignature,
} from './dayzero';
import { PRICING_TIERS } from '@urganize/pricing';
import { resolveTeamTier } from './entitlements';
import { monthlyAllowanceCredits } from './credits/allowance';

const KEY = '3f2b8c1e-7a4d-4e9b-9c2a-1b2c3d4e5f60';
const API_KEY = 'test-api-key';

describe('verifyDayzeroSignature', () => {
  const rawBody = JSON.stringify({ license_key: KEY, event: 'purchase' });
  const timestamp = '1764140000000';
  const signature = signDayzeroPayload(timestamp, rawBody, API_KEY);

  it('accepts the hex HMAC-SHA256 of timestamp + raw body', () => {
    expect(verifyDayzeroSignature({ timestamp, signature, rawBody, apiKey: API_KEY })).toBe(true);
  });

  it('accepts an upper-case hex signature', () => {
    expect(verifyDayzeroSignature({ timestamp, signature: signature.toUpperCase(), rawBody, apiKey: API_KEY })).toBe(true);
  });

  it('refuses a changed body, a changed timestamp, the wrong key, or a missing piece', () => {
    expect(verifyDayzeroSignature({ timestamp, signature, rawBody: rawBody + ' ', apiKey: API_KEY })).toBe(false);
    expect(verifyDayzeroSignature({ timestamp: '1', signature, rawBody, apiKey: API_KEY })).toBe(false);
    expect(verifyDayzeroSignature({ timestamp, signature, rawBody, apiKey: 'other' })).toBe(false);
    expect(verifyDayzeroSignature({ timestamp: null, signature, rawBody, apiKey: API_KEY })).toBe(false);
    expect(verifyDayzeroSignature({ timestamp, signature: null, rawBody, apiKey: API_KEY })).toBe(false);
    expect(verifyDayzeroSignature({ timestamp, signature, rawBody, apiKey: '' })).toBe(false);
    expect(verifyDayzeroSignature({ timestamp, signature: 'abc', rawBody, apiKey: API_KEY })).toBe(false);
  });
});

describe('parseDayzeroWebhook', () => {
  it('reads every field Day Zero sends', () => {
    const parsed = parseDayzeroWebhook({
      license_key: KEY.toUpperCase(),
      event: 'upgrade',
      license_status: 'active',
      event_timestamp: 1764140000123,
      created_at: 1764140000000,
      tier: 1,
      test: false,
      prev_license_key: '00000000-0000-4000-8000-000000000001',
      extra: { reason: 'Upgraded to tier 2' },
    });
    expect(parsed).toEqual({
      licenseKey: KEY,
      event: 'upgrade',
      licenseStatus: 'active',
      eventTimestamp: 1764140000123,
      tier: 1,
      test: false,
      prevLicenseKey: '00000000-0000-4000-8000-000000000001',
      reason: 'Upgraded to tier 2',
    });
  });

  it('falls back to created_at, then now, for the event time', () => {
    expect(parseDayzeroWebhook({ license_key: KEY, event: 'purchase', created_at: 5 })?.eventTimestamp).toBe(5);
    expect(parseDayzeroWebhook({ license_key: KEY, event: 'purchase' }, 99)?.eventTimestamp).toBe(99);
  });

  it('refuses an unknown event or a key that is not a uuid', () => {
    expect(parseDayzeroWebhook({ license_key: KEY, event: 'refund' })).toBeNull();
    expect(parseDayzeroWebhook({ license_key: 'nope', event: 'purchase' })).toBeNull();
    expect(parseDayzeroWebhook(null)).toBeNull();
  });

  it('lets a test event through with any key, marked as a test', () => {
    expect(parseDayzeroWebhook({ license_key: 'test', event: 'activate', test: true })?.test).toBe(true);
  });
});

describe('nextLicenseStatus', () => {
  const row = (status: 'inactive' | 'active' | 'deactivated') => ({ status, userId: null, lastEventMs: 100 });

  it('purchase creates an inactive row and never touches an existing one', () => {
    expect(nextLicenseStatus(null, 'purchase')).toBe('inactive');
    expect(nextLicenseStatus(row('active'), 'purchase')).toBeNull();
    expect(nextLicenseStatus(row('deactivated'), 'purchase')).toBeNull();
  });

  it('activate makes it active; a repeat changes nothing', () => {
    expect(nextLicenseStatus(null, 'activate')).toBe('active');
    expect(nextLicenseStatus(row('inactive'), 'activate')).toBe('active');
    expect(nextLicenseStatus(row('active'), 'activate')).toBeNull();
  });

  it('deactivate refunds it from any state; a repeat changes nothing', () => {
    expect(nextLicenseStatus(row('active'), 'deactivate')).toBe('deactivated');
    expect(nextLicenseStatus(row('inactive'), 'deactivate')).toBe('deactivated');
    expect(nextLicenseStatus(null, 'deactivate')).toBe('deactivated');
    expect(nextLicenseStatus(row('deactivated'), 'deactivate')).toBeNull();
  });

  it('a refund is final: no activate brings Solo Plus back, however new it looks', () => {
    // A retried activate carries a fresh event_timestamp, so time cannot decide.
    expect(nextLicenseStatus(row('deactivated'), 'activate')).toBeNull();
  });
});

describe('applyLifetimeLicense', () => {
  const snapshot = (over: Partial<Parameters<typeof applyLifetimeLicense>[0]> = {}) => ({
    status: 'expired',
    hasAccess: false,
    plan: null as string | null,
    accountStatus: 'unpaid',
    expiresAt: null as string | null,
    trialEndsAt: null as string | null,
    ...over,
  });

  it('without a license, changes nothing', () => {
    const before = snapshot();
    expect(applyLifetimeLicense(before, false)).toEqual({ ...before, lifetime: false });
  });

  it('turns no plan, a trial or a lapse into paid Solo Plus with no end date', () => {
    for (const before of [
      snapshot(),
      snapshot({ status: 'free_trial', hasAccess: true, accountStatus: 'trial', trialEndsAt: '2026-12-01T00:00:00Z' }),
      snapshot({ accountStatus: 'expired', plan: 'label', expiresAt: '2026-01-01T00:00:00Z' }),
    ]) {
      expect(applyLifetimeLicense(before, true)).toMatchObject({
        status: 'active',
        hasAccess: true,
        plan: 'solo_plus',
        accountStatus: 'paid',
        expiresAt: null,
        trialEndsAt: null,
        lifetime: true,
      });
    }
  });

  it('lifts a paid Solo up to Solo Plus', () => {
    const out = applyLifetimeLicense(snapshot({ status: 'active', hasAccess: true, accountStatus: 'paid', plan: 'solo' }), true);
    expect(out.plan).toBe('solo_plus');
    expect(out.lifetime).toBe(true);
  });

  it('leaves a paid plan at or above Solo Plus alone', () => {
    for (const plan of ['solo_plus', 'manager', 'pro', 'label', 'enterprise', 'annual', 'founding']) {
      const before = snapshot({ status: 'active', hasAccess: true, accountStatus: 'paid', plan, expiresAt: '2027-01-01T00:00:00Z' });
      expect(applyLifetimeLicense(before, true)).toEqual({ ...before, lifetime: false });
    }
  });

  it('a lifetime team gets Solo Plus limits and 400 AI credits a month', () => {
    const out = applyLifetimeLicense(snapshot(), true);
    const tier = resolveTeamTier({ state: 'paid', ownerPlan: out.plan });
    expect(tier).toBe('solo_plus');
    expect(monthlyAllowanceCredits({ state: 'paid', tier })).toBe(400);
    expect(PRICING_TIERS[tier].limits).toMatchObject({ artists: 1, seats: 3, activeReleases: 3 });
  });
});

describe('planCoversLifetime', () => {
  it('is true for Solo Plus and up, false for Solo or no plan', () => {
    for (const plan of ['solo_plus', 'manager', 'pro', 'label', 'founding']) expect(planCoversLifetime(plan), plan).toBe(true);
    for (const plan of ['solo', null, undefined, 'trial']) expect(planCoversLifetime(plan), String(plan)).toBe(false);
  });
});

describe('hasLiveCardPlan', () => {
  const now = Date.parse('2026-11-26T00:00:00Z');
  it('is true for an active or past-due row that has not ended', () => {
    expect(hasLiveCardPlan({ status: 'active', expires_at: '2026-12-20T00:00:00Z' }, now)).toBe(true);
    expect(hasLiveCardPlan({ status: 'past_due', expires_at: '2026-12-20T00:00:00Z' }, now)).toBe(true);
  });
  it('is false for no row, a cancelled row, or one that ended', () => {
    expect(hasLiveCardPlan(null, now)).toBe(false);
    expect(hasLiveCardPlan({ status: 'cancelled', expires_at: '2026-12-20T00:00:00Z' }, now)).toBe(false);
    expect(hasLiveCardPlan({ status: 'active', expires_at: '2026-11-01T00:00:00Z' }, now)).toBe(false);
  });
});

describe('claim cookie', () => {
  const secret = 'client-secret';
  const now = 1_000_000;

  it('round-trips while it is fresh', () => {
    const cookie = encodeClaimCookie(KEY, now + 60_000, secret);
    expect(decodeClaimCookie(cookie, secret, now)).toBe(KEY);
  });

  it('refuses an expired, tampered or wrongly signed cookie', () => {
    const cookie = encodeClaimCookie(KEY, now + 60_000, secret);
    expect(decodeClaimCookie(cookie, secret, now + 60_001)).toBeNull();
    expect(decodeClaimCookie(cookie.replace(KEY, '00000000-0000-4000-8000-000000000001'), secret, now)).toBeNull();
    expect(decodeClaimCookie(cookie, 'other', now)).toBeNull();
    expect(decodeClaimCookie('garbage', secret, now)).toBeNull();
    expect(decodeClaimCookie(cookie, '', now)).toBeNull();
  });
});
