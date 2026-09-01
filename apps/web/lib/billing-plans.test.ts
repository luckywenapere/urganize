import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  advancePeriodEnd,
  getPaystackPlanCode,
  getTierMinorUnit,
  getTierPaystackPlanCode,
  identifyPlanByCode,
  isRecurringPlan,
  isSelfServeTier,
  planCodeMatchesSubscription,
  resolveBillingInterval,
  resolveCheckoutPurchase,
} from './billing-plans';
import { BILLING_PLANS, BILLING_PLAN_ORDER, isPricingTierId } from '@urganize/pricing';

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
  it('accepts every plan that renews through Paystack', () => {
    expect(isRecurringPlan('monthly')).toBe(true);
    expect(isRecurringPlan('annual')).toBe(true);
    expect(isRecurringPlan('label')).toBe(true);
    // Added with pricing v2. Its absence was the second half of the bug: this
    // gate is what the webhook's renewal branch checks, so a plan missing here
    // has its renewals SILENTLY STOP EXTENDING.
    expect(isRecurringPlan('manager')).toBe(true);
  });

  it('rejects the legacy/admin plan strings', () => {
    expect(isRecurringPlan('access')).toBe(false);
    expect(isRecurringPlan('custom')).toBe(false);
    expect(isRecurringPlan('')).toBe(false);
  });

  it('rejects enterprise, which is invoiced by hand', () => {
    // It has no Paystack plan code and its expires_at is set by an admin, so a
    // charge event must never be able to reach the renewal math with it.
    expect(isRecurringPlan('enterprise')).toBe(false);
    expect(isSelfServeTier('enterprise')).toBe(false);
    expect(isSelfServeTier('manager')).toBe(true);
  });

  it('keeps renewing Label after it stopped being purchasable', () => {
    // The two lists answer different questions and are MEANT to disagree here.
    // Label went sales-led 2026-08-30, so nobody can buy it any more — but it
    // was self-serve through the whole pricing-v2 launch, so live Label
    // subscriptions exist. Dropping it from isRecurringPlan would make the
    // webhook bail with non_recurring_subscription and silently stop extending
    // them, which is the exact failure that gate was written about.
    expect(isSelfServeTier('label')).toBe(false);
    expect(isRecurringPlan('label')).toBe(true);
  });
});

// ── The interval, which the tier model stopped encoding in the plan name ─────

describe('resolveBillingInterval', () => {
  it('prefers a stored interval over anything the plan name implies', () => {
    // 'label' infers ANNUAL from its name (the legacy roster plan billed
    // yearly). A Label-monthly subscriber must not inherit that.
    expect(resolveBillingInterval({ plan: 'label', storedInterval: 'monthly' })).toBe('monthly');
    expect(resolveBillingInterval({ plan: 'monthly', storedInterval: 'annual' })).toBe('annual');
    expect(resolveBillingInterval({ plan: 'label', storedInterval: ' annual ' })).toBe('annual');
  });

  it('infers from a legacy plan name when nothing is stored', () => {
    expect(resolveBillingInterval({ plan: 'monthly' })).toBe('monthly');
    expect(resolveBillingInterval({ plan: 'annual' })).toBe('annual');
    expect(resolveBillingInterval({ plan: 'yearly' })).toBe('annual');
    expect(resolveBillingInterval({ plan: 'access' })).toBe('annual');
    expect(resolveBillingInterval({ plan: 'label' })).toBe('annual');
  });

  it('defaults to monthly for a tier with nothing recorded', () => {
    // The short one on purpose: under-granting a month is recoverable, and
    // over-granting a year cannot be clawed back.
    expect(resolveBillingInterval({ plan: 'manager' })).toBe('monthly');
    expect(resolveBillingInterval({ plan: 'manager', storedInterval: null })).toBe('monthly');
  });

  it('ignores a malformed stored value rather than trusting it', () => {
    // It comes out of a text column, so anything is possible.
    for (const bogus of ['yearly', 'ANNUAL', 'weekly', '', '   ', null, undefined]) {
      expect(resolveBillingInterval({ plan: 'annual', storedInterval: bogus })).toBe('annual');
      expect(resolveBillingInterval({ plan: 'manager', storedInterval: bogus })).toBe('monthly');
    }
  });

  it('handles an absent plan without throwing', () => {
    expect(resolveBillingInterval({ plan: null })).toBe('monthly');
    expect(resolveBillingInterval({ plan: undefined })).toBe('monthly');
  });
});

describe('advancePeriodEnd — tier plans', () => {
  const now = new Date(2026, 0, 10);
  const currentEnd = new Date(2026, 0, 20);

  it('extends the same tier by a month or a year depending on what was bought', () => {
    // THE BUG, in one assertion pair: without a stored interval both of these
    // resolved off the name and one of them was wrong by eleven months.
    expect(advancePeriodEnd('label', currentEnd, now, 'monthly').getTime()).toBe(
      new Date(2026, 1, 20).getTime()
    );
    expect(advancePeriodEnd('label', currentEnd, now, 'annual').getTime()).toBe(
      new Date(2027, 0, 20).getTime()
    );
    expect(advancePeriodEnd('manager', currentEnd, now, 'annual').getTime()).toBe(
      new Date(2027, 0, 20).getTime()
    );
  });

  it('keeps every legacy plan on its historical period (regression guard)', () => {
    // No stored interval, exactly as every pre-existing row will read.
    expect(advancePeriodEnd('monthly', currentEnd, now).getTime()).toBe(
      new Date(2026, 1, 20).getTime()
    );
    expect(advancePeriodEnd('annual', currentEnd, now).getTime()).toBe(
      new Date(2027, 0, 20).getTime()
    );
    expect(advancePeriodEnd('label', currentEnd, now).getTime()).toBe(
      new Date(2027, 0, 20).getTime()
    );
  });

  it('still refuses to truncate a paid window when an interval is supplied', () => {
    // The lapsed-customer edge, re-checked on the new argument path.
    const lapsed = new Date(2025, 10, 1);
    expect(advancePeriodEnd('manager', lapsed, now, 'monthly').getTime()).toBe(
      new Date(2026, 1, 10).getTime()
    );
  });
});

describe('tier plan codes and prices', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('judges a retired Label renewal against the LIVE plans, not PAYSTACK_PLAN_LABEL_*', () => {
    // This is the trap, so it keeps its test. PAYSTACK_PLAN_LABEL_NGN holds a
    // mislabeled ₦750,000 Plan from an earlier attempt; Label's tier prices were
    // identical to the live monthly/annual ones by design, so those are the Plan
    // objects its subscribers are really billed against.
    //
    // Label went sales-led 2026-08-30, so this no longer runs through
    // getTierPaystackPlanCode (it is off SelfServeTierId and unreachable from
    // checkout) — RETIRED_TIER_PLAN_CODE_ENV_VAR carries it for renewals only.
    // Same trap, same guard, one layer along.
    vi.stubEnv('PAYSTACK_PLAN_MONTHLY_NGN', 'PLN_live_month');
    vi.stubEnv('PAYSTACK_PLAN_ANNUAL_NGN', 'PLN_live_year');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_NGN', 'PLN_wrong_750k');

    const judge = (code: string, storedInterval: 'monthly' | 'annual') =>
      planCodeMatchesSubscription({ code, plan: 'label', storedInterval });

    expect(judge('PLN_live_month', 'monthly')).toBe(true);
    expect(judge('PLN_live_year', 'annual')).toBe(true);
    expect(judge('PLN_wrong_750k', 'monthly')).toBe(false);
  });

  it('reads Manager from its own two env vars', () => {
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_MONTHLY_NGN', '  PLN_mgr_m  ');
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_ANNUAL_NGN', 'PLN_mgr_a');
    expect(getTierPaystackPlanCode('manager', 'monthly')).toBe('PLN_mgr_m');
    expect(getTierPaystackPlanCode('manager', 'annual')).toBe('PLN_mgr_a');
  });

  it('returns null when a tier plan is not configured, so checkout refuses', () => {
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_MONTHLY_NGN', '');
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_ANNUAL_NGN', '   ');
    expect(getTierPaystackPlanCode('manager', 'monthly')).toBeNull();
    expect(getTierPaystackPlanCode('manager', 'annual')).toBeNull();
  });

  it('prices each tier per interval, in kobo', () => {
    // Manager is the only self-serve tier since 2026-08-30, so it is the only
    // one a checkout can price.
    expect(getTierMinorUnit('manager', 'monthly')).toBe(35_000_00);
    expect(getTierMinorUnit('manager', 'annual')).toBe(350_000_00);
  });
});

describe('planCodeMatchesSubscription', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not flag a Label renewal against the shared legacy plan code', () => {
    // The reason this resolves FORWARD instead of reverse-mapping: Label reuses
    // the legacy annual Plan, so a reverse lookup would report a mismatch on
    // every Label renewal and fill the logs with a warning about our flagship.
    vi.stubEnv('PAYSTACK_PLAN_ANNUAL_NGN', 'PLN_live_year');
    expect(
      planCodeMatchesSubscription({
        code: 'PLN_live_year',
        plan: 'label',
        storedInterval: 'annual',
      })
    ).toBe(true);
    // And it is interval-sensitive: the annual code on a monthly subscription
    // IS a real mismatch worth logging.
    vi.stubEnv('PAYSTACK_PLAN_MONTHLY_NGN', 'PLN_live_month');
    expect(
      planCodeMatchesSubscription({
        code: 'PLN_live_year',
        plan: 'label',
        storedInterval: 'monthly',
      })
    ).toBe(false);
  });

  it('matches a legacy plan against either currency variant', () => {
    vi.stubEnv('PAYSTACK_PLAN_ANNUAL_NGN', 'PLN_ngn');
    vi.stubEnv('PAYSTACK_PLAN_ANNUAL_USD', 'PLN_usd');
    expect(planCodeMatchesSubscription({ code: 'PLN_usd', plan: 'annual' })).toBe(true);
    expect(planCodeMatchesSubscription({ code: 'PLN_other', plan: 'annual' })).toBe(false);
  });

  it('says nothing when it cannot judge, so a renewal is never blocked', () => {
    // No incoming code, nothing configured, or an unrecognised plan: all must
    // read as "no opinion" rather than as a mismatch.
    expect(planCodeMatchesSubscription({ code: null, plan: 'annual' })).toBe(true);
    expect(planCodeMatchesSubscription({ code: '  ', plan: 'annual' })).toBe(true);
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_ANNUAL_NGN', '');
    expect(planCodeMatchesSubscription({ code: 'PLN_x', plan: 'manager' })).toBe(true);
    expect(planCodeMatchesSubscription({ code: 'PLN_x', plan: 'access' })).toBe(true);
  });
});

// ── What a checkout request resolves to ─────────────────────────────────────
//
// This decides which Paystack Plan a customer's card is charged against, and
// for how long. The route it serves cannot be exercised from a test without
// mocking Supabase and fetch, so the decision is pinned here instead.

describe('resolveCheckoutPurchase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const stubLive = () => {
    vi.stubEnv('PAYSTACK_PLAN_MONTHLY_NGN', 'PLN_live_month');
    vi.stubEnv('PAYSTACK_PLAN_ANNUAL_NGN', 'PLN_live_year');
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_MONTHLY_NGN', 'PLN_mgr_month');
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_ANNUAL_NGN', 'PLN_mgr_year');
  };

  it('resolves a tier purchase to its Plan, price and interval', () => {
    stubLive();
    expect(
      resolveCheckoutPurchase({
        plan: 'manager',
        currency: 'NGN',
        interval: 'annual',
        pricingV2: true,
      })
    ).toEqual({
      ok: true,
      planId: 'manager',
      planCode: 'PLN_mgr_year',
      amountMinorUnit: 350_000_00,
      interval: 'annual',
    });
  });

  it('refuses to sell Label, which went sales-led', () => {
    // Label was self-serve at the live Plans until 2026-08-30. Now it is quoted
    // by hand, so checkout must refuse it at BOTH intervals rather than charging
    // a card for a tier nobody is allowed to buy — even though those Plan
    // objects are still configured and still renewing its existing subscribers.
    //
    // ⚠️ THIS TEST USED TO PASS FOR THE WRONG REASON, and the fix is the
    // `PAYSTACK_PLAN_LABEL_NGN` stub below (added 2026-09-01). `stubLive()` does
    // not set that var, so the refusal was really "plan code not configured" (a
    // 500) coming out of the LEGACY branch — not the sales-led decision. Since
    // that Plan genuinely exists in the Paystack dashboard at a stale ₦750,000,
    // setting the var in production would have removed the only thing refusing
    // this, and a request for Label would have charged ₦750,000 while recording
    // ₦800,000.
    //
    // Stubbing it is what makes the assertion mean what it says: with a valid
    // Plan code available, the ONLY thing that can refuse is the sales-led guard.
    // Hence the 400 — the status is the whole point, because a 500 here would be
    // the old accidental pass returning.
    stubLive();
    vi.stubEnv('PAYSTACK_PLAN_LABEL_NGN', 'PLN_stale_label');
    for (const interval of ['monthly', 'annual'] as const) {
      const result = resolveCheckoutPurchase({
        plan: 'label',
        currency: 'NGN',
        interval,
        pricingV2: true,
      });
      expect(result.ok, `label/${interval}`).toBe(false);
      if (result.ok) throw new Error('expected a refusal');
      expect(result.status, `label/${interval} status`).toBe(400);
      expect(result.error).toContain('Label');
    }
  });

  it('refuses a sales-led plan with pricing v2 OFF too', () => {
    // The flag decides which GENERATION a request is read in, never whether a
    // sales-led plan may be bought. With the flag off, 'label' is a legacy id
    // and reaches the legacy branch directly — so if the guard sat inside the
    // tier branch this would still charge.
    stubLive();
    vi.stubEnv('PAYSTACK_PLAN_LABEL_NGN', 'PLN_stale_label');
    const result = resolveCheckoutPurchase({
      plan: 'label',
      currency: 'NGN',
      interval: undefined,
      pricingV2: false,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.status).toBe(400);
  });

  // Pins the assumption `readSalesLedPlanName` rests on: it does ONE lookup,
  // against PRICING_TIERS, because every sales-led id is also a tier id. If a
  // legacy-only id ('monthly', 'annual') ever became sales-led, that single
  // lookup would silently stop refusing it — so this fails first instead.
  it('salesLedIdsAreAllTierIds', () => {
    for (const planId of BILLING_PLAN_ORDER) {
      if (!BILLING_PLANS[planId].contactSales) continue;
      expect(isPricingTierId(planId), `${planId} is sales-led but not a tier id`).toBe(true);
    }
  });

  it('refuses Group by its display name, not its stored id', () => {
    // The id is 'enterprise' and customers read "Group". A refusal naming the id
    // would be meaningless to the person reading it.
    stubLive();
    const result = resolveCheckoutPurchase({
      plan: 'enterprise',
      currency: 'NGN',
      interval: 'annual',
      pricingV2: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.status).toBe(400);
    expect(result.error).toContain('Group');
    expect(result.error).not.toContain('enterprise');
  });

  it('records NO interval for a legacy purchase, whose id already carries it', () => {
    stubLive();
    expect(
      resolveCheckoutPurchase({
        plan: 'annual',
        currency: 'NGN',
        interval: undefined,
        pricingV2: true,
      })
    ).toMatchObject({ ok: true, planId: 'annual', planCode: 'PLN_live_year', interval: null });
  });

  it('still accepts legacy ids with pricing v2 ON', () => {
    // The live paywall posts these, so refusing them the moment the flag flips
    // would break checkout for everyone.
    stubLive();
    expect(
      resolveCheckoutPurchase({ plan: 'monthly', currency: 'NGN', interval: undefined, pricingV2: true })
    ).toMatchObject({ ok: true, planId: 'monthly' });
  });

  it('rejects a tier outright with pricing v2 OFF', () => {
    stubLive();
    expect(
      resolveCheckoutPurchase({
        plan: 'manager',
        currency: 'NGN',
        interval: 'annual',
        pricingV2: false,
      })
    ).toEqual({
      ok: false,
      status: 400,
      error: 'plan must be "monthly", "annual", or "label".',
    });
  });

  it('refuses enterprise with its own message, whatever the flag says', () => {
    for (const pricingV2 of [true, false]) {
      const result = resolveCheckoutPurchase({
        plan: 'enterprise',
        currency: 'NGN',
        interval: 'annual',
        pricingV2,
      });
      expect(result).toMatchObject({ ok: false, status: 400 });
      expect(result.ok === false && result.error).toMatch(/quoted per contract/i);
    }
  });

  it('requires an interval for a tier, and refuses a malformed one', () => {
    stubLive();
    for (const bogus of [undefined, null, '', 'yearly', 'ANNUAL', 3]) {
      const result = resolveCheckoutPurchase({
        plan: 'manager',
        currency: 'NGN',
        interval: bogus,
        pricingV2: true,
      });
      expect(result).toMatchObject({ ok: false, status: 400 });
      expect(result.ok === false && result.error).toMatch(/interval must be/i);
    }
  });

  it('refuses a tier in USD rather than half-attempting it', () => {
    // There are no USD tier prices and no PAYSTACK_PLAN_*_USD var has ever been
    // set, so getting one step further before failing would be worse.
    stubLive();
    const result = resolveCheckoutPurchase({
      plan: 'manager',
      currency: 'USD',
      interval: 'annual',
      pricingV2: true,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(result.ok === false && result.error).toMatch(/Naira/i);
  });

  it('reports an unconfigured Plan as a 500 rather than charging something else', () => {
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_ANNUAL_NGN', '');
    const result = resolveCheckoutPurchase({
      plan: 'manager',
      currency: 'NGN',
      interval: 'annual',
      pricingV2: true,
    });
    expect(result).toMatchObject({ ok: false, status: 500 });
    expect(result.ok === false && result.error).toMatch(/not configured/i);
  });

  it('answers the malformed request before the unconfigured one', () => {
    // Error precedence: a caller must never be told "plan not configured" for a
    // request that was invalid to begin with.
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_ANNUAL_NGN', '');
    const result = resolveCheckoutPurchase({
      plan: 'manager',
      currency: 'NGN',
      interval: 'quarterly',
      pricingV2: true,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});
