import { describe, expect, it } from 'vitest';
import { PRICING_TIERS, getTierPrice, isPricingTierId } from '@urganize/pricing';
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

/** Exactly half of a nominal 365-day annual period. */
const HALF_YEAR_LEFT = new Date('2027-03-02T12:00:00.000Z').toISOString();
/** A full nominal annual period. */
const FULL_YEAR_LEFT = new Date('2027-09-01T00:00:00.000Z').toISOString();

// ANNUAL THROUGHOUT since 2026-09-08, because that is the only interval sold.
// The monthly cases below in `unusedFraction` stay: PERIOD_DAYS still carries a
// monthly length and real subscriptions still bill on it, so the arithmetic has
// to keep working for them even though nothing new is sold that way.
//
// Solo↔Manager↔Label are the priced tiers. Derived rather than literal, so a
// reprice moves the expectations with the tier table.
const annualDiff =
  (getTierPrice('manager', 'annual')?.minorUnit ?? 0) -
  (getTierPrice('solo', 'annual')?.minorUnit ?? 0);

/**
 * Quote a change for a team paying TODAY'S list price.
 *
 * Every test below except the grandfathered ones is about the arithmetic, and
 * every one of them would otherwise have to restate the current tier's price to
 * get past `isGrandfatheredRate`. Filling it from the tier table keeps that out
 * of the fixtures and keeps a reprice from having to touch them.
 */
function quoteAtListPrice(
  input: Omit<Parameters<typeof quotePlanChange>[0], 'currentPaidMinorUnit'>
) {
  return quotePlanChange({
    ...input,
    currentPaidMinorUnit: isPricingTierId(input.currentPlan)
      ? (getTierPrice(input.currentPlan, input.currentInterval)?.minorUnit ?? null)
      : null,
  });
}

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
    const quote = quoteAtListPrice({
      currentPlan: 'solo',
      currentInterval: 'annual',
      targetTier: 'manager',
      targetInterval: 'annual',
      periodEndsAt: HALF_YEAR_LEFT,
      now: NOW,
    });
    expect(quote.kind).toBe('upgrade');
    if (quote.kind !== 'upgrade') return;
    // Half a period of the difference, not half a period of the new price and
    // not the whole difference.
    expect(quote.amountMinorUnit).toBe(Math.round(annualDiff * 0.5));
    expect(quote.periodEndsAt).toBe(HALF_YEAR_LEFT);
    expect(quote.daysRemaining).toBe(183);
  });

  it('charges the full difference at the very start of a period', () => {
    const quote = quoteAtListPrice({
      currentPlan: 'solo',
      currentInterval: 'annual',
      targetTier: 'manager',
      targetInterval: 'annual',
      periodEndsAt: FULL_YEAR_LEFT,
      now: NOW,
    });
    if (quote.kind !== 'upgrade') throw new Error('expected an upgrade');
    expect(quote.amountMinorUnit).toBe(annualDiff);
  });

  it('never charges more than the outright difference', () => {
    // The clamp matters: a 366-day period must not produce 100.3% of the gap.
    const quote = quoteAtListPrice({
      currentPlan: 'solo',
      currentInterval: 'annual',
      targetTier: 'manager',
      targetInterval: 'annual',
      periodEndsAt: new Date('2027-10-15T00:00:00.000Z').toISOString(),
      now: NOW,
    });
    if (quote.kind !== 'upgrade') throw new Error('expected an upgrade');
    expect(quote.amountMinorUnit).toBeLessThanOrEqual(annualDiff);
  });

  it('grants the upgrade free rather than billing an unchargeable amount', () => {
    // Late in the period the prorated difference falls under what Paystack will
    // process. Charging it would produce a broken checkout; the most this gives
    // away is a few days of the gap between two tiers.
    const quote = quoteAtListPrice({
      currentPlan: 'solo',
      currentInterval: 'annual',
      targetTier: 'manager',
      targetInterval: 'annual',
      periodEndsAt: new Date('2026-09-01T00:30:00.000Z').toISOString(),
      now: NOW,
    });
    if (quote.kind !== 'upgrade') throw new Error('expected an upgrade');
    expect(quote.amountMinorUnit).toBe(0);
  });

  it('either charges nothing or charges at least the floor, never in between', () => {
    // Swept across a whole year so no hour produces an amount Paystack would
    // reject. Both branches are genuinely reached: the crossing point for the
    // Solo→Manager gap sits around 52 hours out.
    let sawFree = false;
    let sawCharged = false;
    for (let hours = 1; hours <= 365 * 24; hours += 168) {
      const end = new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
      const quote = quoteAtListPrice({
        currentPlan: 'solo',
        currentInterval: 'annual',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: end,
        now: NOW,
      });
      if (quote.kind !== 'upgrade') throw new Error('expected an upgrade');
      if (quote.amountMinorUnit === 0) sawFree = true;
      else sawCharged = true;
      const ok =
        quote.amountMinorUnit === 0 || quote.amountMinorUnit >= MIN_CHARGEABLE_MINOR_UNIT;
      expect(ok, `${hours}h -> ${quote.amountMinorUnit}`).toBe(true);
    }
    expect(sawFree && sawCharged, 'the sweep must reach both branches').toBe(true);
  });

  it('prices a move up to Label, which is buyable again', () => {
    const quote = quoteAtListPrice({
      currentPlan: 'manager',
      currentInterval: 'annual',
      targetTier: 'label',
      targetInterval: 'annual',
      periodEndsAt: FULL_YEAR_LEFT,
      now: NOW,
    });
    if (quote.kind !== 'upgrade') throw new Error('expected an upgrade');
    const gap =
      (getTierPrice('label', 'annual')?.minorUnit ?? 0) -
      (getTierPrice('manager', 'annual')?.minorUnit ?? 0);
    expect(quote.amountMinorUnit).toBe(gap);
  });
});

describe('quotePlanChange — downgrade', () => {
  it('moves nobody early and charges nothing', () => {
    const quote = quoteAtListPrice({
      currentPlan: 'manager',
      currentInterval: 'annual',
      targetTier: 'solo',
      targetInterval: 'annual',
      periodEndsAt: HALF_YEAR_LEFT,
      now: NOW,
    });
    expect(quote.kind).toBe('downgrade');
    if (quote.kind !== 'downgrade') return;
    // They paid for the higher tier through this period and they keep it.
    expect(quote.effectiveAt).toBe(HALF_YEAR_LEFT);
    expect(quote.daysRemaining).toBe(183);
    // No amount field at all on this branch, so no caller can charge for it.
    expect('amountMinorUnit' in quote).toBe(false);
  });
});

// ── The 2026-09-08 reprice, and the guard it required ────────────────────────
//
// Every tier's list price moved, and the founder's rule is that existing paying
// accounts keep the price they signed up on. This module reads BOTH ends of a
// change out of @urganize/pricing, so for anyone who bought before that date the
// credit side is a number they have never paid. These pin that it refuses rather
// than quoting against the wrong base.
describe('quotePlanChange — a team on a price we no longer list', () => {
  const base = {
    currentPlan: 'solo' as const,
    currentInterval: 'annual' as const,
    targetTier: 'manager',
    targetInterval: 'annual',
    periodEndsAt: HALF_YEAR_LEFT,
    now: NOW,
  };

  it('quotes normally for a team paying exactly today\'s price', () => {
    const quote = quotePlanChange({
      ...base,
      currentPaidMinorUnit: getTierPrice('solo', 'annual')?.minorUnit ?? 0,
    });
    expect(quote.kind).toBe('upgrade');
  });

  it('refuses a team still on the old ₦80,000 Solo price', () => {
    const quote = quotePlanChange({ ...base, currentPaidMinorUnit: 80_000_00 });
    expect(quote).toEqual({ kind: 'refused', reason: 'grandfathered_rate' });
  });

  it('refuses a team paying LESS than the list price too', () => {
    // Direction-blind on purpose. A discounted or partly-comped account is just
    // as much a rate this package does not hold, and quoting against the list
    // price would undercharge them rather than overcharge — still wrong, and
    // still not the page's call to make.
    const quote = quotePlanChange({ ...base, currentPaidMinorUnit: 1_000_00 });
    expect(quote).toEqual({ kind: 'refused', reason: 'grandfathered_rate' });
  });

  it('refuses when the amount is unreadable, rather than guessing', () => {
    // Fails toward refusing: wrongly refusing costs a support message, wrongly
    // allowing takes the wrong amount of real money and noticing later does not
    // undo it.
    for (const paid of [null, undefined, 0, -1, Number.NaN]) {
      const quote = quotePlanChange({ ...base, currentPaidMinorUnit: paid });
      expect(quote, String(paid)).toEqual({ kind: 'refused', reason: 'grandfathered_rate' });
    }
  });

  it('says "you are already on this plan" ahead of the rate refusal', () => {
    // Both are true for a grandfathered team asking for the plan it is on, and
    // the identity answer is the more useful of the two.
    const quote = quotePlanChange({
      ...base,
      targetTier: 'solo',
      currentPaidMinorUnit: 80_000_00,
    });
    expect(quote).toEqual({ kind: 'refused', reason: 'same_plan' });
  });
});

describe('quotePlanChange — what it refuses', () => {
  const cases: Array<
    [
      string,
      Omit<Parameters<typeof quotePlanChange>[0], 'currentPaidMinorUnit'>,
      PlanChangeRefusalReason,
    ]
  > = [
    [
      'the same plan',
      {
        currentPlan: 'manager',
        currentInterval: 'annual',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: HALF_YEAR_LEFT,
        now: NOW,
      },
      'same_plan',
    ],
    [
      // Nothing is SOLD monthly any more, but subscriptions that bill monthly
      // still exist, so this stays reachable: one of them asking to move to the
      // annual price is a conversation, not arithmetic.
      'a change of interval, which would mean restarting the period',
      {
        currentPlan: 'solo',
        currentInterval: 'monthly',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: HALF_YEAR_LEFT,
        now: NOW,
      },
      'interval_change',
    ],
    [
      // Group (id `enterprise`) was a real sales-led tier until 2026-09-09,
      // when it was removed from @urganize/pricing entirely — not merely made
      // priceless. So this case is now functionally identical to "an unknown
      // target" below it: isPricingTierId('enterprise') is false, and this
      // reason code already covers "not a tier at all" and "a tier but
      // contactSales" alike. Kept as its own case anyway, because a stray
      // client still bookmarking the old id is a real scenario distinct from
      // a typo.
      'a stray "enterprise" target, now unrecognised rather than sales-led',
      {
        currentPlan: 'manager',
        currentInterval: 'annual',
        targetTier: 'enterprise',
        targetInterval: 'annual',
        periodEndsAt: HALF_YEAR_LEFT,
        now: NOW,
      },
      'sales_led_target',
    ],
    [
      'an unknown target',
      {
        currentPlan: 'manager',
        currentInterval: 'annual',
        targetTier: 'platinum',
        targetInterval: 'annual',
        periodEndsAt: HALF_YEAR_LEFT,
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
        periodEndsAt: HALF_YEAR_LEFT,
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
        periodEndsAt: HALF_YEAR_LEFT,
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
        periodEndsAt: HALF_YEAR_LEFT,
        now: NOW,
      },
      'legacy_current_plan',
    ],
    [
      'a period that has already lapsed',
      {
        currentPlan: 'solo',
        currentInterval: 'annual',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: new Date('2026-08-01T00:00:00.000Z').toISOString(),
        now: NOW,
      },
      'no_active_period',
    ],
    [
      'no period at all',
      {
        currentPlan: 'solo',
        currentInterval: 'annual',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: null,
        now: NOW,
      },
      'no_active_period',
    ],
    [
      'an absent current plan',
      {
        currentPlan: null,
        currentInterval: 'annual',
        targetTier: 'manager',
        targetInterval: 'annual',
        periodEndsAt: HALF_YEAR_LEFT,
        now: NOW,
      },
      'legacy_current_plan',
    ],
  ];

  for (const [name, input, reason] of cases) {
    it(`refuses ${name}`, () => {
      expect(quoteAtListPrice(input)).toEqual({ kind: 'refused', reason });
    });
  }

  it('gives every refusal copy that names the next step', () => {
    const reasons: PlanChangeRefusalReason[] = [
      'same_plan',
      'interval_change',
      'sales_led_target',
      'legacy_current_plan',
      'grandfathered_rate',
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

  it('never tells a customer what they pay in the rate refusal', () => {
    // It may be more than the new price, it may be less, it may be a comped
    // deal. The number on their invoice is not this page's to discuss.
    const message = planChangeRefusalMessage('grandfathered_rate');
    expect(message).not.toMatch(/₦|\d/);
  });
});

describe('the quote can never contradict the tier table', () => {
  it('treats every cheaper-or-equal move as a downgrade', () => {
    const priced = (['solo', 'manager', 'label'] as const).filter(
      (tier) => !PRICING_TIERS[tier].contactSales
    );
    for (const from of priced) {
      for (const to of priced) {
        if (from === to) continue;
        const fromPrice = getTierPrice(from, 'annual')?.minorUnit ?? 0;
        const toPrice = getTierPrice(to, 'annual')?.minorUnit ?? 0;
        const quote = quoteAtListPrice({
          currentPlan: from,
          currentInterval: 'annual',
          targetTier: to,
          targetInterval: 'annual',
          periodEndsAt: new Date(NOW.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          now: NOW,
        });
        expect(quote.kind, `${from} -> ${to}`).toBe(toPrice > fromPrice ? 'upgrade' : 'downgrade');
      }
    }
  });

  // Nothing on the ladder is sales-led any more — Group (id `enterprise`),
  // the one tier that structurally lacked `prices`, was removed from
  // @urganize/pricing entirely on 2026-09-09. This is the replacement
  // assertion: every tier the package advertises today carries a price,
  // which is what makes the loop above (every priced pair resolves cleanly
  // to upgrade or downgrade) exhaustive rather than merely lucky.
  it('carries a price for every tier the package advertises', () => {
    for (const tier of Object.keys(PRICING_TIERS) as Array<keyof typeof PRICING_TIERS>) {
      expect(PRICING_TIERS[tier].prices, tier).toBeDefined();
    }
  });
});
