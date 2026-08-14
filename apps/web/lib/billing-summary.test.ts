import { describe, expect, it } from 'vitest';
import {
  describePlanName,
  formatBillingDate,
  isContactSalesPlan,
  summarizeBilling,
  type BillingSnapshot,
} from './billing-summary';

const base: BillingSnapshot = {
  accountStatus: 'unpaid',
  plan: null,
  trialEndsAt: null,
  trialDaysLeft: 0,
  expiresAt: null,
  trialUsed: false,
  allowlisted: false,
};

const snapshot = (overrides: Partial<BillingSnapshot> = {}): BillingSnapshot => ({
  ...base,
  ...overrides,
});

describe('describePlanName', () => {
  it('names the three billing tiers from the shared pricing package', () => {
    expect(describePlanName('monthly')).toBe('Monthly');
    expect(describePlanName('annual')).toBe('Annual');
    expect(describePlanName('label')).toBe('Label');
  });

  it('names the legacy plan values that still exist in production rows', () => {
    expect(describePlanName('access')).toBe('Access');
    expect(describePlanName('custom')).toBe('Custom');
  });

  it('returns null rather than leaking a raw enum for anything unrecognised', () => {
    expect(describePlanName('trial_claim')).toBeNull();
    expect(describePlanName('')).toBeNull();
    expect(describePlanName(null)).toBeNull();
  });

  // The load-bearing rule: a price must never be asserted, because the list
  // price in @urganize/pricing is not necessarily what a grandfathered
  // subscriber actually pays.
  it('never returns a currency amount', () => {
    for (const plan of ['monthly', 'annual', 'label', 'access', 'custom']) {
      const name = describePlanName(plan);
      expect(name).not.toMatch(/[₦$]|\d/);
    }
  });
});

describe('isContactSalesPlan', () => {
  it('is true only for the sales-led tier', () => {
    expect(isContactSalesPlan('label')).toBe(true);
    expect(isContactSalesPlan('monthly')).toBe(false);
    expect(isContactSalesPlan('annual')).toBe(false);
    expect(isContactSalesPlan('access')).toBe(false);
    expect(isContactSalesPlan(null)).toBe(false);
  });
});

describe('formatBillingDate', () => {
  it('formats a timestamptz into the app-wide long date shape', () => {
    // Asserted by parts, not a locale-specific string: the app formats with the
    // runtime's own locale, so a hardcoded expectation would be environment-bound.
    const formatted = formatBillingDate('2026-08-25T09:30:00.000Z');
    expect(formatted).toBeTruthy();
    expect(formatted).toContain('2026');
    expect(formatted).toMatch(/2[45]/); // timezone may land either side of midnight
  });

  it('returns null for missing or unparseable input', () => {
    expect(formatBillingDate(null)).toBeNull();
    expect(formatBillingDate('')).toBeNull();
    expect(formatBillingDate('not a date')).toBeNull();
  });
});

describe('summarizeBilling', () => {
  it('puts allowlisted access ahead of status and offers no CTA', () => {
    // An allowlisted account reads back as paid with plan 'allowlist'; a
    // status-first ordering would show it a plan it does not have.
    const result = summarizeBilling(
      snapshot({ allowlisted: true, accountStatus: 'paid', plan: 'allowlist' })
    );
    expect(result.title).toBe('Complimentary access');
    expect(result.cta).toBeNull();
  });

  it('counts down a trial and names its end date', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'trial', trialDaysLeft: 12, trialEndsAt: '2026-08-25T00:00:00.000Z' })
    );
    expect(result.title).toBe('Free trial');
    expect(result.details[0]).toBe('12 days left.');
    expect(result.details[1]).toContain('Ends ');
    expect(result.cta).toBe('plans');
  });

  it('says a day, singular, on the last day', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'trial', trialDaysLeft: 1 }));
    expect(result.details[0]).toBe('1 day left.');
  });

  it('says ends today rather than a zero or negative count', () => {
    expect(summarizeBilling(snapshot({ accountStatus: 'trial', trialDaysLeft: 0 })).details[0]).toBe(
      'Ends today.'
    );
    expect(summarizeBilling(snapshot({ accountStatus: 'trial', trialDaysLeft: -3 })).details[0]).toBe(
      'Ends today.'
    );
  });

  it('titles a paid plan by name and offers a change', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'paid', plan: 'monthly', expiresAt: '2026-09-13T00:00:00.000Z' })
    );
    expect(result.title).toBe('Monthly plan');
    expect(result.details[0]).toContain('Active until ');
    expect(result.cta).toBe('change');
  });

  it('says "Active until", never "Renews" — renewal is not knowable from this snapshot', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'paid', plan: 'annual', expiresAt: '2027-08-13T00:00:00.000Z' })
    );
    expect(result.details.join(' ')).not.toMatch(/renew/i);
  });

  it('falls back to a generic paid title for an unrecognised plan', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'paid', plan: 'trial_claim' }));
    expect(result.title).toBe('Active plan');
  });

  it('routes a Label plan to contact, not to the self-serve picker', () => {
    // Label has no wired Paystack checkout, so /locked would be a dead end.
    expect(summarizeBilling(snapshot({ accountStatus: 'paid', plan: 'label' })).cta).toBe('contact');
    expect(summarizeBilling(snapshot({ accountStatus: 'expired', plan: 'label' })).cta).toBe(
      'contact'
    );
  });

  it('reports an expired plan by name with its end date', () => {
    const result = summarizeBilling(
      snapshot({ accountStatus: 'expired', plan: 'annual', expiresAt: '2026-08-01T00:00:00.000Z' })
    );
    expect(result.title).toBe('Annual plan ended');
    expect(result.details[0]).toContain('Ended ');
    expect(result.cta).toBe('plans');
  });

  it('offers the trial to an account that has never used one', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'unpaid', trialUsed: false }));
    expect(result.title).toBe('No plan yet');
    expect(result.details[0]).toContain('28-day free trial');
    expect(result.cta).toBe('plans');
  });

  it('does not re-offer a trial that has already been used', () => {
    const result = summarizeBilling(snapshot({ accountStatus: 'unpaid', trialUsed: true }));
    expect(result.details[0]).toBe('Your free trial has finished.');
    expect(result.details.join(' ')).not.toContain('28-day');
  });

  it('omits date lines entirely when the snapshot has no dates', () => {
    for (const status of ['trial', 'paid', 'expired', 'unpaid'] as const) {
      const result = summarizeBilling(snapshot({ accountStatus: status }));
      for (const line of result.details) expect(line).not.toContain('null');
      expect(result.title).toBeTruthy();
    }
  });

  // The paywall gate is off in code today, so the copy must not claim otherwise.
  it('never threatens loss of access', () => {
    for (const status of ['trial', 'paid', 'expired', 'unpaid'] as const) {
      const result = summarizeBilling(snapshot({ accountStatus: status, trialUsed: true }));
      const all = [result.title, ...result.details].join(' ');
      expect(all).not.toMatch(/lose access|locked out|will be locked/i);
    }
  });
});
