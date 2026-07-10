import { describe, expect, it } from 'vitest';
import { calculateTrialDaysLeft, resolveSnapshot } from './subscription-access';

// resolveSnapshot IS the four-state access model (unpaid | trial | paid |
// expired) behind the global gate — the fail-closed decision every protected
// API request rides on. These tests pin the five resolution paths and their
// boundaries. `now` is fixed so nothing here depends on wall-clock time.

const NOW = new Date('2026-07-10T12:00:00.000Z');
const FUTURE = '2026-08-01T00:00:00.000Z';
const PAST = '2026-06-01T00:00:00.000Z';

describe('resolveSnapshot', () => {
  it('path 1 — active subscription that has not expired → paid, has access', () => {
    const snapshot = resolveSnapshot(
      { status: 'active', expires_at: FUTURE, plan: 'monthly' },
      { trial_used: true },
      NOW
    );
    expect(snapshot.accountStatus).toBe('paid');
    expect(snapshot.hasAccess).toBe(true);
    expect(snapshot.status).toBe('active');
    expect(snapshot.plan).toBe('monthly');
  });

  it('path 1 — cancelled-but-still-in-window keeps access until expiry', () => {
    const snapshot = resolveSnapshot(
      { status: 'cancelled', expires_at: FUTURE, plan: 'annual' },
      null,
      NOW
    );
    expect(snapshot.accountStatus).toBe('paid');
    expect(snapshot.hasAccess).toBe(true);
  });

  it('path 1 — past_due within the already-paid window keeps access (Paystack retry grace)', () => {
    // The webhook writes past_due on invoice.payment_failed while Paystack
    // retries; the user paid for the window expires_at covers. Asserted
    // WITHOUT the is_subscribed back-compat flag — this must hold on the
    // status alone (it silently didn't until 2026-07-10).
    const snapshot = resolveSnapshot(
      { status: 'past_due', expires_at: FUTURE, plan: 'monthly' },
      null,
      NOW
    );
    expect(snapshot.accountStatus).toBe('paid');
    expect(snapshot.hasAccess).toBe(true);
  });

  it('past_due past its window does NOT keep access', () => {
    const snapshot = resolveSnapshot(
      { status: 'past_due', expires_at: PAST, plan: 'monthly' },
      null,
      NOW
    );
    expect(snapshot.hasAccess).toBe(false);
    expect(snapshot.accountStatus).toBe('expired');
  });

  it('an expired active row does NOT grant access (falls through to expired)', () => {
    const snapshot = resolveSnapshot(
      { status: 'active', expires_at: PAST, plan: 'monthly' },
      { trial_used: true },
      NOW
    );
    expect(snapshot.hasAccess).toBe(false);
    expect(snapshot.accountStatus).toBe('expired');
  });

  it('expiry boundary — expires_at exactly now counts as expired', () => {
    const snapshot = resolveSnapshot(
      { status: 'active', expires_at: NOW.toISOString(), plan: 'monthly' },
      { trial_used: true },
      NOW
    );
    expect(snapshot.hasAccess).toBe(false);
  });

  it('path 1b — legacy is_subscribed back-compat grants access with no subscription row', () => {
    const snapshot = resolveSnapshot(null, { is_subscribed: true }, NOW);
    expect(snapshot.accountStatus).toBe('paid');
    expect(snapshot.hasAccess).toBe(true);
  });

  it('path 2 — legacy trialing subscription still in window → trial', () => {
    const snapshot = resolveSnapshot(
      { status: 'trialing', expires_at: FUTURE, plan: null },
      null,
      NOW
    );
    expect(snapshot.accountStatus).toBe('trial');
    expect(snapshot.hasAccess).toBe(true);
    expect(snapshot.status).toBe('free_trial');
  });

  it('path 3 — profile-driven trial active → trial, trialUsed reported true', () => {
    const snapshot = resolveSnapshot(
      null,
      { trial_used: true, trial_started_at: PAST, trial_ends_at: FUTURE },
      NOW
    );
    expect(snapshot.accountStatus).toBe('trial');
    expect(snapshot.hasAccess).toBe(true);
    expect(snapshot.trialUsed).toBe(true);
    expect(snapshot.trialEndsAt).toBe(FUTURE);
  });

  it('path 4 — trial used and ended → expired, no access', () => {
    const snapshot = resolveSnapshot(
      null,
      { trial_used: true, trial_started_at: PAST, trial_ends_at: PAST },
      NOW
    );
    expect(snapshot.accountStatus).toBe('expired');
    expect(snapshot.hasAccess).toBe(false);
  });

  it('path 5 — never paid, never trialed → unpaid, no access (fail-closed default)', () => {
    const snapshot = resolveSnapshot(null, null, NOW);
    expect(snapshot.accountStatus).toBe('unpaid');
    expect(snapshot.hasAccess).toBe(false);
  });

  it('documents current behavior: an unparseable expires_at on an active row is treated as not expired', () => {
    // parseTimestamp returns null for garbage, so isSubExpired stays false
    // and path 1 grants access. Pinned so a future change here is a
    // conscious decision, not an accident.
    const snapshot = resolveSnapshot(
      { status: 'active', expires_at: 'not-a-date', plan: 'monthly' },
      null,
      NOW
    );
    expect(snapshot.hasAccess).toBe(true);
  });
});

describe('calculateTrialDaysLeft', () => {
  it('returns 0 for null / past / exactly-now trial ends', () => {
    expect(calculateTrialDaysLeft(null, NOW)).toBe(0);
    expect(calculateTrialDaysLeft(PAST, NOW)).toBe(0);
    expect(calculateTrialDaysLeft(NOW.toISOString(), NOW)).toBe(0);
  });

  it('rounds partial days up (36h left reads as 2 days)', () => {
    const in36Hours = new Date(NOW.getTime() + 36 * 60 * 60 * 1000).toISOString();
    expect(calculateTrialDaysLeft(in36Hours, NOW)).toBe(2);
  });
});
