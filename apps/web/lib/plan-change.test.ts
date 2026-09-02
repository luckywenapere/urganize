import { describe, expect, it } from 'vitest';
import { PRICING_TIERS, getTierPrice } from '@urganize/pricing';
import {
  MIN_CHARGEABLE_MINOR_UNIT,
  planChangeRefusalMessage,
  quotePlanChange,
  unusedFraction,
  type PlanChangeRefusalReason,
} from './plan-change';

// This module decides how much real money a team is charged to change plan, and
// none of it can be exercised against live Paystack from here. So the arithmetic
// is pinned hard, and every refusal is pinned too — a refusal that silently
// became a charge is the worst regression this file could have.

const NOW = new Date('2026-09-01T00:00:00.000Z');
/** 15 days out, i.e. exactly half of a nominal 30-day monthly period. */
const HALF_MONTH_LEFT = new Date('2026-09-16T00:00:00.000Z').toISOString();

// Solo↔Manager is the only priced pair left after Label went sales-led on
// 2026-08-30. Derived rather than literal, so a reprice moves the expectations
// with the tier table.
const monthlyDiff =
  (getTierPrice('manager', 'monthly')?.minorUnit ?? 0) -
  (getTierPrice('solo', 'monthly')?.minorUnit ?? 0);

describe('unusedFraction', () => {
  it('is a half at the midpoint of a monthly period', () => {
    expect(
      unusedFraction({
        periodEnd: new Date(HALF_MONTH_LEFT),
        now: NOW,
        interval: 'monthly',
      })
    ).toBeCloseTo(0.5, 10);
  });

  it('clamps to 1 when the period runs longer than nominal', () => {
    // A 31-day month reads as full rather than as 1.03 of a period, which is
    // what stops an upgrade ever costing MORE than the outright difference.
    const end = new Date('2026-10-02T00:00:00.000Z');
    expect(unusedFraction({ periodEnd: end, now: NOW, interval: 'monthly' })).toBe(1);
  });

  it('clamps to 0 for a period that has already ended', () => {
    const end = new Date('2026-08-01T00:00:00.000Z');
    expect(unusedFraction({ periodEnd: end, now: NOW, interval: 'monthly' })).toBe(0);
  });

  it('prorates an annual period over 365 days', () => {
    const end = new Date('2027-03-01T00:00:00.000Z'); // 181 days out
    const fraction = unusedFraction({ periodEnd: end, now: NOW, interval: 'annual' });
    expect(fraction).toBeCloseTo(181 / 365, 6);
  });
});

describe('quotePlanChange — upgrade', () => {
  it('charges the difference for the days left, and never moves the period end', () => {
    const quote = quotePlanChange({
      currentPlan: 'solo',
      currentInterval: 'monthly',
      targetTier: 'manager',
      targetInterval: 'monthly',
      periodEndsAt: HALF_MONTH_LEFT,
      now: NOW,
    });
    expect(quote.kind).toBe('upgrade');
    if (quote.kind !== 'upgrade') return;
    // Half a period of the difference, not half a period of the new price and
    // not the whole difference.
    expect(quote.amountMinorUnit).toBe(Math.round(monthlyDiff * 0.5));
    expect(quote.periodEndsAt).toBe(HALF_MONTH_LEFT);
    expect(quote.daysRemaining).toBe(15);
  });

  it('charges the full difference at the very start of a period', () => {
    const quote = quotePlanChange({
      currentPlan: 'solo',
      currentInterval: 'monthly',
      targetTier: 'manager',
      targetInterval: 'monthly',
      periodEndsAt: new Date('2026-10-01T00:00:00.000Z').toISOString(),
      now: NOW,
    });
    if (quote.kind !== 'upgrade') throw new Error('expected an upgrade');
    expect(quote.amountMinorUnit).toBe(monthlyDiff);
  });

  it('never charges more than the outright difference', () => {
    // The clamp matters: a 31-day period must not produce 103% of the gap.
    const quote = quotePlanChange({
      currentPlan: 'solo',
      currentInterval: 'monthly',
      targetTier: 'manager',
      targetInterval: 'monthly',
      periodEndsAt: new Date('2026-10-15T00:00:00.000Z').toISOString(),
      now: NOW,
    });
    if (quote.kind !== 'upgrade') throw new Error('expected an upgrade');
    expect(quote.amountMinorUnit).toBeLessThanOrEqual(monthlyDiff);
  });

  it('grants the upgrade free rather than billing an unchargeable amount', () => {
    // Late in the period the prorated difference falls under what Paystack will
    // process. Charging it would produce a broken checkout; the most this gives
    // away is a few days of the gap between two tiers.
    const quote = quotePlanChange({
      currentPlan: 'solo',
      currentInterval: 'monthly',
      targetTier: 'manager',
      targetInterval: 'monthly',
      periodEndsAt: new Date('2026-09-01T00:30:00.000Z').toISOString(),
      now: NOW,
    });
    if (quote.kind !== 'upgrade') throw new Error('expected an upgrade');
    expect(quote.amountMinorUnit).toBe(0);
  });

  it('either charges nothing or charges at least the floor, never in between', () => {
    // Swept across a whole period so no hour produces an amount Paystack would
    // reject.
    for (let hours = 1; hours <= 30 * 24; hours += 7) {
      const end = new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
      const quote = quotePlanChange({
        currentPlan: 'solo',
        currentInterval: 'monthly',
        targetTier: 'manager',
        targetInterval: 'monthly',
        periodEndsAt: end,
        now: NOW,
      });
      if (quote.kind !== 'upgrade') throw new Error('expected an upgrade');
      const ok =
        quote.amountMinorUnit === 0 || quote.amountMinorUnit >= MIN_CHARGEABLE_MINOR_UNIT;
      expect(ok).toBe(true);
    }
  });
});

describe('quotePlanChange — downgrade', () => {
  it('moves nobody early and charges nothing', () => {
    const quote = quotePlanChange({
      currentPlan: 'manager',
      currentInterval: 'monthly',
      targetTier: 'solo',
      targetInterval: 'monthly',
      periodEndsAt: HALF_MONTH_LEFT,
      now: NOW,
    });
    expect(quote.kind).toBe('downgrade');
    if (quote.kind !== 'downgrade') return;
    // They paid for the higher tier through this period and they keep it.
    expect(quote.effectiveAt).toBe(HALF_MONTH_LEFT);
    expect(quote.daysRemaining).toBe(15);
    // No amount field at all on this branch, so no caller can charge for it.
    expect('amountMinorUnit' in quote).toBe(false);
  });
});

describe('quotePlanChange — what it refuses', () => {
  const cases: Array<[string, Parameters<typeof quotePlanChange>[0], PlanChangeRefusalReason]> = [
    [
      'the same plan',
      {
        currentPlan: 'manager',
        currentInterval: 'monthly',
        targetTier: 'manager',
        targetInterval: 'monthly',
        periodEndsAt: HALF_MONTH_LEFT,
        now: NOW,
      },
      'same_plan',
    ],
    [
      'a change of interval, which would mean restarting the period',
      {
        currentPlan: 'solo',
        currentInterval: 'monthly',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: HALF_MONTH_LEFT,
        now: NOW,
      },
      'interval_change',
    ],
    [
      'a sales-led target with no price to prorate',
      {
        currentPlan: 'manager',
        currentInterval: 'monthly',
        targetTier: 'enterprise',
        targetInterval: 'monthly',
        periodEndsAt: HALF_MONTH_LEFT,
        now: NOW,
      },
      'sales_led_target',
    ],
    [
      // NEW 2026-08-30: Label used to be the flagship self-serve target and
      // was the upgrade path these tests were written around. Now it is quoted
      // by hand, so a self-serve move ONTO it must refuse rather than charge a
      // card for a tier nobody may buy.
      'Label as a target, now that it is sales-led',
      {
        currentPlan: 'manager',
        currentInterval: 'monthly',
        targetTier: 'label',
        targetInterval: 'monthly',
        periodEndsAt: HALF_MONTH_LEFT,
        now: NOW,
      },
      'sales_led_target',
    ],
    [
      // The other half: an existing Label subscriber cannot self-serve their
      // way OFF it either. Their rate is one we quoted by hand, so the change
      // is a conversation rather than arithmetic this package can do.
      'Label as the current plan, which we may not hold the rate for',
      {
        currentPlan: 'label',
        currentInterval: 'monthly',
        targetTier: 'manager',
        targetInterval: 'monthly',
        periodEndsAt: HALF_MONTH_LEFT,
        now: NOW,
      },
      'legacy_current_plan',
    ],
    [
      'an unknown target',
      {
        currentPlan: 'manager',
        currentInterval: 'monthly',
        targetTier: 'platinum',
        targetInterval: 'monthly',
        periodEndsAt: HALF_MONTH_LEFT,
        now: NOW,
      },
      'sales_led_target',
    ],
    [
      'a legacy current plan whose real rate we may not hold',
      {
        currentPlan: 'annual',
        currentInterval: 'annual',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: new Date('2027-03-01T00:00:00.000Z').toISOString(),
        now: NOW,
      },
      'legacy_current_plan',
    ],
    [
      'a grandfathered plan',
      {
        currentPlan: 'founding',
        currentInterval: 'annual',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: new Date('2027-03-01T00:00:00.000Z').toISOString(),
        now: NOW,
      },
      'legacy_current_plan',
    ],
    [
      'an admin-provisioned plan',
      {
        currentPlan: 'custom',
        currentInterval: 'annual',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: new Date('2027-03-01T00:00:00.000Z').toISOString(),
        now: NOW,
      },
      'legacy_current_plan',
    ],
    [
      'a period that has already lapsed',
      {
        currentPlan: 'solo',
        currentInterval: 'monthly',
        targetTier: 'manager',
        targetInterval: 'monthly',
        periodEndsAt: new Date('2026-08-01T00:00:00.000Z').toISOString(),
        now: NOW,
      },
      'no_active_period',
    ],
    [
      'no period at all',
      {
        currentPlan: 'solo',
        currentInterval: 'monthly',
        targetTier: 'manager',
        targetInterval: 'monthly',
        periodEndsAt: null,
        now: NOW,
      },
      'no_active_period',
    ],
    [
      'an absent current plan',
      {
        currentPlan: null,
        currentInterval: 'monthly',
        targetTier: 'manager',
        targetInterval: 'monthly',
        periodEndsAt: HALF_MONTH_LEFT,
        now: NOW,
      },
      'legacy_current_plan',
    ],
  ];

  for (const [name, input, reason] of cases) {
    it(`refuses ${name}`, () => {
      const quote = quotePlanChange(input);
      expect(quote).toEqual({ kind: 'refused', reason });
    });
  }

  it('gives every refusal copy that names the next step', () => {
    const reasons: PlanChangeRefusalReason[] = [
      'same_plan',
      'interval_change',
      'sales_led_target',
      'legacy_current_plan',
      'no_active_period',
    ];
    for (const reason of reasons) {
      const message = planChangeRefusalMessage(reason);
      expect(message.length).toBeGreaterThan(0);
      // House copy rules: no em dashes anywhere in customer-facing strings.
      expect(message).not.toContain('—');
      // A dead end is the one thing a refusal must not be, so every reason
      // except "you are already on it" has to point somewhere.
      if (reason !== 'same_plan') {
        expect(message).toMatch(/talk to us|activate a plan/i);
      }
    }
  });
});

describe('the quote can never contradict the tier table', () => {
  it('treats every cheaper-or-equal move as a downgrade, across both intervals', () => {
    for (const interval of ['monthly', 'annual'] as const) {
      for (const from of ['solo', 'manager'] as const) {
        for (const to of ['solo', 'manager'] as const) {
          if (from === to) continue;
          const fromPrice = getTierPrice(from, interval)?.minorUnit ?? 0;
          const toPrice = getTierPrice(to, interval)?.minorUnit ?? 0;
          const quote = quotePlanChange({
            currentPlan: from,
            currentInterval: interval,
            targetTier: to,
            targetInterval: interval,
            periodEndsAt: new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
            now: NOW,
          });
          expect(quote.kind).toBe(toPrice > fromPrice ? 'upgrade' : 'downgrade');
        }
      }
    }
  });

  it('never quotes a price for a tier the package has no price for', () => {
    // Group (id `enterprise`) carries no `prices` at all, which is what makes this
    // structural rather than a lookup that happens to return undefined.
    expect(PRICING_TIERS.enterprise.prices).toBeUndefined();
  });
});
