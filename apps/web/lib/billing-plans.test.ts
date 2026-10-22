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
import {
  BILLING_PLANS,
  BILLING_PLAN_ORDER,
  PRICING_TIERS,
  PRICING_TIER_ORDER,
} from '@urganize/pricing';

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

  it('sells Label again, self-serve', () => {
    // Label came back to self-serve on 2026-09-08 with a ₦50,000/year price,
    // having been sales-led since 2026-08-30.
    expect(isSelfServeTier('label')).toBe(true);
    expect(isRecurringPlan('label')).toBe(true);
  });

  // Group (id `enterprise`) was the one tier in neither list while it existed
  // — no Paystack Plan, no card checkout, and an expires_at an admin set by
  // hand rather than a charge. Removed entirely from @urganize/pricing on
  // 2026-09-09, so this is no longer "the sales-led tier is excluded"; it is
  // "a stray legacy row still reads as neither", which matters because the DB
  // CHECK constraint still permits the string (see the removal note in
  // @urganize/pricing).
  it('treats a stray enterprise plan string as neither self-serve nor recurring', () => {
    expect(isRecurringPlan('enterprise')).toBe(false);
    expect(isSelfServeTier('enterprise')).toBe(false);
    expect(isSelfServeTier('manager')).toBe(true);
  });

  it('keeps renewing the legacy plans nobody can buy', () => {
    // The two lists answer different questions and are MEANT to disagree here.
    // Nothing sells 'monthly' or 'annual' any more — they are not tiers — but
    // live subscriptions on them exist, and dropping them from isRecurringPlan
    // would make the webhook bail with non_recurring_subscription and silently
    // stop extending them, which is the exact failure that gate was written
    // about.
    for (const legacy of ['monthly', 'annual'] as const) {
      expect(isSelfServeTier(legacy), legacy).toBe(false);
      expect(isRecurringPlan(legacy), legacy).toBe(true);
    }
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

  it('reads each tier and interval from its own env var', () => {
    vi.stubEnv('PAYSTACK_PLAN_SOLO_PER_MONTH_NGN', '  PLN_solo_m  ');
    vi.stubEnv('PAYSTACK_PLAN_SOLO_PER_YEAR_NGN', 'PLN_solo_y');
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_PER_MONTH_NGN', 'PLN_mgr_m');
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_PER_YEAR_NGN', 'PLN_mgr_y');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_PER_MONTH_NGN', 'PLN_label_m');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_PER_YEAR_NGN', 'PLN_label_y');
    expect(getTierPaystackPlanCode('solo', 'monthly')).toBe('PLN_solo_m');
    expect(getTierPaystackPlanCode('solo', 'annual')).toBe('PLN_solo_y');
    expect(getTierPaystackPlanCode('manager', 'monthly')).toBe('PLN_mgr_m');
    expect(getTierPaystackPlanCode('manager', 'annual')).toBe('PLN_mgr_y');
    expect(getTierPaystackPlanCode('label', 'monthly')).toBe('PLN_label_m');
    expect(getTierPaystackPlanCode('label', 'annual')).toBe('PLN_label_y');
  });

  // THE TWO INTERVALS MUST NOT CROSS. Billing a yearly Plan for a monthly
  // request charges ten times the advertised figure, which is why the var names
  // are PER_MONTH and PER_YEAR rather than a shared stem with a suffix.
  it('never answers one interval with the Plan for the other', () => {
    vi.stubEnv('PAYSTACK_PLAN_SOLO_PER_MONTH_NGN', 'PLN_solo_m');
    vi.stubEnv('PAYSTACK_PLAN_SOLO_PER_YEAR_NGN', '');
    expect(getTierPaystackPlanCode('solo', 'annual')).toBeNull();
    vi.stubEnv('PAYSTACK_PLAN_SOLO_PER_MONTH_NGN', '');
    vi.stubEnv('PAYSTACK_PLAN_SOLO_PER_YEAR_NGN', 'PLN_solo_y');
    expect(getTierPaystackPlanCode('solo', 'monthly')).toBeNull();
  });

  // ⚠️ PAYSTACK_PLAN_LABEL_YEARLY_NGN IS NOT PAYSTACK_PLAN_LABEL_NGN. The second
  // exists and holds a mislabeled ₦750,000 Plan from an early attempt. They
  // differ by one word, and setting the wrong one bills a Label customer
  // ₦750,000 for a ₦50,000 tier — so pin that the tier reads neither the legacy
  // var nor the shared annual one.
  it('never resolves Label to the stale legacy plan vars', () => {
    // The superseded vars are all set to recognisable values: if the tier reads
    // ANY of them, this fails rather than a customer being billed the wrong
    // amount for the wrong term.
    vi.stubEnv('PAYSTACK_PLAN_LABEL_NGN', 'PLN_stale_750k');
    vi.stubEnv('PAYSTACK_PLAN_ANNUAL_NGN', 'PLN_shared_legacy');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_YEARLY_NGN', 'PLN_superseded_5k_year');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_PER_MONTH_NGN', '');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_PER_YEAR_NGN', '');
    expect(getTierPaystackPlanCode('label', 'monthly')).toBeNull();
    expect(getTierPaystackPlanCode('label', 'annual')).toBeNull();
  });

  it('returns null when a tier plan is not configured, so checkout refuses', () => {
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_PER_MONTH_NGN', '   ');
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_PER_YEAR_NGN', '   ');
    expect(getTierPaystackPlanCode('manager', 'monthly')).toBeNull();
    expect(getTierPaystackPlanCode('manager', 'annual')).toBeNull();
  });

  it('prices every self-serve tier at both intervals, in kobo', () => {
    // Monthly is the stored figure; yearly is ten months of it, computed.
    // 2026-10-22 reprice: ₦8,000 / ₦30,000 a month (Label ₦60,000 unchanged).
    expect(getTierMinorUnit('solo', 'monthly')).toBe(8_000_00);
    expect(getTierMinorUnit('manager', 'monthly')).toBe(30_000_00);
    expect(getTierMinorUnit('label', 'monthly')).toBe(60_000_00);
    expect(getTierMinorUnit('solo', 'annual')).toBe(80_000_00);
    expect(getTierMinorUnit('manager', 'annual')).toBe(300_000_00);
    expect(getTierMinorUnit('solo', 'semiannual')).toBe(40_000_00);
    expect(getTierMinorUnit('manager', 'semiannual')).toBe(150_000_00);
    expect(getTierMinorUnit('label', 'annual')).toBe(600_000_00);
  });
});

describe('planCodeMatchesSubscription', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts both the current Plan and the ones a tier used to be sold on', () => {
    // A reprice mints a new Plan and repoints the var, so a subscriber from
    // before it legitimately renews against a code that is no longer current.
    // Judging them against today's Plan alone would log a warning on every
    // renewal of theirs for the rest of their life. Label is the sharpest case:
    // it was sold on the SHARED legacy annual Plan until 2026-09-08.
    vi.stubEnv('PAYSTACK_PLAN_LABEL_YEARLY_NGN', 'PLN_label_2026');
    vi.stubEnv('PAYSTACK_PLAN_ANNUAL_NGN', 'PLN_live_year');
    vi.stubEnv('PAYSTACK_PLAN_MONTHLY_NGN', 'PLN_live_month');

    for (const code of ['PLN_label_2026', 'PLN_live_year', 'PLN_live_month']) {
      expect(
        planCodeMatchesSubscription({ code, plan: 'label', storedInterval: 'annual' }),
        code
      ).toBe(true);
    }
    // A code from no Plan we ever sold this tier on is still a real mismatch.
    expect(
      planCodeMatchesSubscription({
        code: 'PLN_somebody_elses',
        plan: 'label',
        storedInterval: 'annual',
      })
    ).toBe(false);
  });

  it('says nothing when it cannot judge, rather than warning on every renewal', () => {
    // Nothing configured for this tier in this environment. An absent code is
    // not evidence of a mismatch, and this check must never be the thing that
    // makes a renewal look wrong.
    vi.stubEnv('PAYSTACK_PLAN_SOLO_YEARLY_NGN', '');
    vi.stubEnv('PAYSTACK_PLAN_SOLO_ANNUAL_NGN', '');
    vi.stubEnv('PAYSTACK_PLAN_SOLO_MONTHLY_NGN', '');
    expect(
      planCodeMatchesSubscription({ code: 'PLN_anything', plan: 'solo', storedInterval: 'annual' })
    ).toBe(true);
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
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_YEARLY_NGN', '');
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
    vi.stubEnv('PAYSTACK_PLAN_SOLO_PER_MONTH_NGN', 'PLN_solo_m');
    vi.stubEnv('PAYSTACK_PLAN_SOLO_PER_YEAR_NGN', 'PLN_solo_y');
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_PER_MONTH_NGN', 'PLN_mgr_m');
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_PER_YEAR_NGN', 'PLN_mgr_y');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_PER_MONTH_NGN', 'PLN_label_m');
    vi.stubEnv('PAYSTACK_PLAN_LABEL_PER_YEAR_NGN', 'PLN_label_y');
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
      planCode: 'PLN_mgr_y',
      amountMinorUnit: 300_000_00,
      interval: 'annual',
    });
  });

  it('sells Label at its own Plan, never the stale ₦750,000 one', () => {
    // Label became self-serve again on 2026-09-08, and is ₦60,000/month since
    // 2026-10-17, so a year of it is ₦600,000. The trap it
    // has to clear: PAYSTACK_PLAN_LABEL_NGN exists in the dashboard holding a
    // mislabeled ₦750,000 Plan, and it is one word away from the var this tier
    // actually reads. Stubbed here precisely so a regression that reached for it
    // would show up as the wrong code rather than as "not configured".
    stubLive();
    vi.stubEnv('PAYSTACK_PLAN_LABEL_NGN', 'PLN_stale_750k');
    expect(
      resolveCheckoutPurchase({
        plan: 'label',
        currency: 'NGN',
        interval: 'annual',
        pricingV2: true,
      })
    ).toEqual({
      ok: true,
      planId: 'label',
      planCode: 'PLN_label_y',
      amountMinorUnit: 600_000_00,
      interval: 'annual',
    });
  });

  it('sells a monthly tier purchase at the monthly Plan and price', () => {
    // Monthly went back on sale 2026-09-10. This test refused it while annual
    // was the only interval; it now pins the opposite, and specifically that a
    // monthly request resolves the MONTHLY Plan rather than the yearly one —
    // crossing those bills ten times the advertised figure.
    stubLive();
    expect(
      resolveCheckoutPurchase({
        plan: 'manager',
        currency: 'NGN',
        interval: 'monthly',
        pricingV2: true,
      })
    ).toEqual({
      ok: true,
      planId: 'manager',
      planCode: 'PLN_mgr_m',
      amountMinorUnit: 30_000_00,
      interval: 'monthly',
    });
  });

  it('refuses an interval that is not one of ours', () => {
    // A stale client or an old bookmark is the likely source, so it is a 400
    // with a sentence rather than the 500 the amount lookup would produce.
    stubLive();
    const result = resolveCheckoutPurchase({
      plan: 'manager',
      currency: 'NGN',
      interval: 'weekly',
      pricingV2: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected a refusal');
    expect(result.status).toBe(400);
    expect(result.error).toContain('interval');
  });

  // Group (id `enterprise`) was the one tier that was quoted per contract; it
  // was removed from @urganize/pricing entirely on 2026-09-09, so 'enterprise'
  // is no longer recognised as sales-led in EITHER generation — it is simply
  // an unknown string now, refused the same way any garbage plan id is. This
  // used to assert the error named "Group"; re-asserting that would be
  // re-inventing a tier that no longer exists, so the assertion is now that it
  // does NOT.
  it('refuses a stray "enterprise" string as an unknown plan, not as sales-led', () => {
    stubLive();
    for (const pricingV2 of [true, false]) {
      const result = resolveCheckoutPurchase({
        plan: 'enterprise',
        currency: 'NGN',
        interval: 'annual',
        pricingV2,
      });
      expect(result.ok, `pricingV2=${pricingV2}`).toBe(false);
      if (result.ok) throw new Error('expected a refusal');
      expect(result.status, `pricingV2=${pricingV2}`).toBe(400);
      expect(result.error, `pricingV2=${pricingV2}`).not.toContain('Group');
      expect(result.error, `pricingV2=${pricingV2}`).not.toMatch(/quoted per contract/i);
    }
  });

  it('refuses the LEGACY label plan with pricing v2 off, and sells the TIER with it on', () => {
    // ⚠️ THE SHARPEST EDGE IN THIS MODULE, and a bug that shipped for a day.
    // 'label' is a valid id in both generations and the two disagree about it
    // since 2026-09-08: the TIER is a ₦50,000/year self-serve plan, while the
    // LEGACY id is still the retired sales-led roster plan whose
    // PAYSTACK_PLAN_LABEL_NGN holds a mislabeled ₦750,000 Plan.
    //
    // readSalesLedPlanName did one lookup against the tier table, which answered
    // "not sales-led" for both — so a flag-off request would have fallen through
    // to the legacy branch and charged ₦750,000 while recording ₦800,000. It
    // asks which generation the request is being read in now, and this pins both
    // halves so neither can regress into the other.
    stubLive();
    vi.stubEnv('PAYSTACK_PLAN_LABEL_NGN', 'PLN_stale_750k');

    const legacy = resolveCheckoutPurchase({
      plan: 'label',
      currency: 'NGN',
      interval: undefined,
      pricingV2: false,
    });
    expect(legacy.ok).toBe(false);
    if (legacy.ok) throw new Error('expected a refusal');
    expect(legacy.status).toBe(400);
    expect(legacy.error).toContain('Label');

    const tier = resolveCheckoutPurchase({
      plan: 'label',
      currency: 'NGN',
      interval: 'annual',
      pricingV2: true,
    });
    expect(tier.ok).toBe(true);
    if (!tier.ok) throw new Error('expected a sale');
    expect(tier.planCode).toBe('PLN_label_y');
  });

  // Pins what `readSalesLedPlanName` actually has to guarantee: a plan that is
  // sales-led IN A GENERATION is refused when a request is read in that
  // generation. Written over both tables rather than over a list of ids, so a
  // tier going sales-led — or coming back, as Label did twice — cannot leave a
  // hole. Its predecessor pinned "every sales-led legacy id is also a tier id",
  // which stayed true while the bug above was live and so caught nothing.
  it('refuses every sales-led plan, in the generation that calls it sales-led', () => {
    for (const planId of BILLING_PLAN_ORDER) {
      if (!BILLING_PLANS[planId].contactSales) continue;
      const result = resolveCheckoutPurchase({
        plan: planId,
        currency: 'NGN',
        interval: undefined,
        pricingV2: false,
      });
      expect(result.ok, `legacy ${planId}`).toBe(false);
      if (!result.ok) expect(result.status, `legacy ${planId}`).toBe(400);
    }
    for (const tierId of PRICING_TIER_ORDER) {
      if (!PRICING_TIERS[tierId].contactSales) continue;
      const result = resolveCheckoutPurchase({
        plan: tierId,
        currency: 'NGN',
        interval: 'annual',
        pricingV2: true,
      });
      expect(result.ok, `tier ${tierId}`).toBe(false);
      if (!result.ok) expect(result.status, `tier ${tierId}`).toBe(400);
    }
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
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_YEARLY_NGN', '');
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
    vi.stubEnv('PAYSTACK_PLAN_MANAGER_YEARLY_NGN', '');
    const result = resolveCheckoutPurchase({
      plan: 'manager',
      currency: 'NGN',
      interval: 'quarterly',
      pricingV2: true,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});
