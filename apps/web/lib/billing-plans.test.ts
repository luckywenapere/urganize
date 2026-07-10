import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advancePeriodEnd,
  getPaystackPlanCode,
  identifyPlanByCode,
  isRecurringPlan,
} from './billing-plans';

// advancePeriodEnd is the renewal math the Paystack webhook trusts: a late
// renewal must EXTEND the paid window from the current period end, and a
// long-lapsed customer must restart from now — never a shortened period.

describe('advancePeriodEnd', () => {
  it('extends from the current period end when it is still in the future (late renewal)', () => {
    const now = new Date(2026, 0, 10);
    const currentEnd = new Date(2026, 0, 20);
    expect(advancePeriodEnd('monthly', currentEnd, now).getTime()).toBe(
      new Date(2026, 1, 20).getTime()
    );
  });

  it('restarts from now when the current period end is in the past (lapsed customer)', () => {
    const now = new Date(2026, 2, 15);
    const currentEnd = new Date(2026, 0, 1);
    expect(advancePeriodEnd('monthly', currentEnd, now).getTime()).toBe(
      new Date(2026, 3, 15).getTime()
    );
  });

  it('starts from now when there is no current period end', () => {
    const now = new Date(2026, 2, 15);
    expect(advancePeriodEnd('monthly', null, now).getTime()).toBe(
      new Date(2026, 3, 15).getTime()
    );
  });

  it.each(['annual', 'label'] as const)('%s advances one year (both bill annually)', (plan) => {
    const now = new Date(2026, 0, 10);
    const currentEnd = new Date(2026, 4, 1);
    expect(advancePeriodEnd(plan, currentEnd, now).getTime()).toBe(
      new Date(2027, 4, 1).getTime()
    );
  });

  it('never truncates: result is always after the later of currentEnd and now', () => {
    const now = new Date(2026, 0, 10);
    const currentEnd = new Date(2026, 5, 1);
    const next = advancePeriodEnd('monthly', currentEnd, now);
    expect(next.getTime()).toBeGreaterThan(currentEnd.getTime());
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it('does not mutate its inputs', () => {
    const now = new Date(2026, 0, 10);
    const currentEnd = new Date(2026, 0, 20);
    const nowSnapshot = now.getTime();
    const endSnapshot = currentEnd.getTime();
    advancePeriodEnd('annual', currentEnd, now);
    expect(now.getTime()).toBe(nowSnapshot);
    expect(currentEnd.getTime()).toBe(endSnapshot);
  });
});

describe('getPaystackPlanCode / identifyPlanByCode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the trimmed env value for a configured plan', () => {
    vi.stubEnv('PAYSTACK_PLAN_MONTHLY_NGN', '  PLN_month_ngn  ');
    expect(getPaystackPlanCode('monthly', 'NGN')).toBe('PLN_month_ngn');
  });

  it('returns null when the env var is unset or blank', () => {
    // Both vars stubbed explicitly — reading the ambient process.env would
    // make this flake the day the real Label plan code is configured.
    vi.stubEnv('PAYSTACK_PLAN_ANNUAL_USD', '   ');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_USD', '');
    expect(getPaystackPlanCode('annual', 'USD')).toBeNull();
    expect(getPaystackPlanCode('label', 'USD')).toBeNull();
  });

  it('identifyPlanByCode reverse-maps a configured code to its plan + currency', () => {
    vi.stubEnv('PAYSTACK_PLAN_MONTHLY_NGN', 'PLN_a');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_USD', 'PLN_b');
    expect(identifyPlanByCode('PLN_a')).toEqual({ plan: 'monthly', currency: 'NGN' });
    expect(identifyPlanByCode(' PLN_b ')).toEqual({ plan: 'label', currency: 'USD' });
  });

  it('identifyPlanByCode returns null for unknown, empty, and missing codes', () => {
    vi.stubEnv('PAYSTACK_PLAN_MONTHLY_NGN', 'PLN_a');
    expect(identifyPlanByCode('PLN_unknown')).toBeNull();
    expect(identifyPlanByCode('')).toBeNull();
    expect(identifyPlanByCode(null)).toBeNull();
    expect(identifyPlanByCode(undefined)).toBeNull();
  });
});

describe('isRecurringPlan', () => {
  it('accepts exactly the three recurring tiers', () => {
    expect(isRecurringPlan('monthly')).toBe(true);
    expect(isRecurringPlan('annual')).toBe(true);
    expect(isRecurringPlan('label')).toBe(true);
  });

  it('rejects the legacy/admin plan strings', () => {
    expect(isRecurringPlan('access')).toBe(false);
    expect(isRecurringPlan('custom')).toBe(false);
    expect(isRecurringPlan('')).toBe(false);
  });
});
