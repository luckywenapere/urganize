import {
  getTier,
  getTierPrice,
  isPricingTierId,
  type BillingInterval,
  type PricingTierId,
} from '@urganize/pricing';

// Moving between tiers, and what it costs.
//
// Pure and self-contained so the arithmetic is testable: this decides how much
// real money a team is charged, and the route that calls it cannot be reached
// from a test without mocking Supabase and Paystack. Every judgement about a
// plan change lives here; the route only executes what this returns.
//
// THE POLICY (founder call, 2026-08-24):
//
//   UPGRADE  - charge the difference in value for the days they have left, once,
//              now. Their paid-through date does NOT move and the new tier's
//              limits apply as soon as the charge clears. They already paid for
//              this period; they are topping it up, not rebuying it.
//   DOWNGRADE - no money moves. The tier changes when the current period ends.
//              They paid for the higher tier through the period and they keep
//              it. No refunds, and nothing is taken away early.
//
// WHAT THIS DELIBERATELY REFUSES, and why refusing is the right answer rather
// than a gap: every case below either needs a price this package does not hold,
// or needs a policy the founder did not choose. A refusal routes the team to a
// human, which at this scale is a better outcome than a confident wrong number.
//
//   - A CHANGE OF INTERVAL (monthly to annual, or back). Keeping the
//     paid-through date fixed is coherent only within one interval. Monthly to
//     annual is buying a year, which means restarting the period — the policy
//     the founder explicitly did not pick. So it is a conversation, not a
//     button.
//   - A SALES-LED TARGET. Enterprise is quoted per contract and has no price
//     to prorate against.
//   - A LEGACY OR ADMIN CURRENT PLAN ('monthly', 'annual', 'access', 'custom',
//     'founding'). A grandfathered rate is not in @urganize/pricing at all
//     (CLAUDE.md: the displayed amounts are today's LIST prices, not
//     necessarily what an account pays), so the credit side of the arithmetic
//     would be a guess. Someone on a legacy plan changing tier is exactly the
//     conversation the founder wants to have anyway.

/** Nominal period lengths, in days.
 *
 * NOMINAL RATHER THAN MEASURED, on purpose. The obvious alternative is to
 * subtract one interval from `expires_at` to get the real period length — but
 * that arithmetic clamps on short months (the drift documented at the top of
 * lib/urgans-usage.ts), so a period ending March 3 would measure as 28 days when
 * it was really 31, making the unused fraction slightly too big and the charge
 * slightly too high. A fixed 30 and 365 is predictable, explainable to a
 * customer in one sentence, and cannot drift. The fraction is clamped to 1 below,
 * so a 31-day period simply reads as full.
 *
 * This is NOT the "you cannot derive a period start by subtracting" rule being
 * broken elsewhere — nothing here derives a start date at all. */
const PERIOD_DAYS: Record<BillingInterval, number> = {
  monthly: 30,
  annual: 365,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Below this, a prorated upgrade is granted free rather than charged.
 *
 * Paystack will not process an arbitrarily small amount, and a team upgrading on
 * the last day of their period would otherwise get a broken checkout for the
 * price of a text message. The most this can give away is a few days of the
 * difference between two tiers, and it buys a working upgrade at any point in
 * the cycle. Matches the floor the card-verification charge already uses. */
export const MIN_CHARGEABLE_MINOR_UNIT = 100_00;

/** Marks a `payments` row as a prorated plan-change top-up rather than a first
 *  charge. Lives here rather than on either route because BOTH read it — the
 *  route that writes it and the webhook that acts on it — and a route importing
 *  a constant from another route is a dependency neither should have. */
export const PLAN_CHANGE_SOURCE = 'plan_change';

export type PlanChangeRefusalReason =
  | 'same_plan'
  | 'interval_change'
  | 'sales_led_target'
  | 'legacy_current_plan'
  | 'no_active_period';

export type PlanChangeQuote =
  | {
      kind: 'upgrade';
      targetTier: PricingTierId;
      interval: BillingInterval;
      /** What to charge now, in kobo. Always at least MIN_CHARGEABLE_MINOR_UNIT
       *  when non-zero; zero means "grant it, do not charge". */
      amountMinorUnit: number;
      /** Whole days left in the paid period, for the confirmation copy. */
      daysRemaining: number;
      /** Unchanged by an upgrade. Echoed so the caller does not recompute it. */
      periodEndsAt: string;
    }
  | {
      kind: 'downgrade';
      targetTier: PricingTierId;
      interval: BillingInterval;
      /** When the new tier starts. The current period end, untouched. */
      effectiveAt: string;
      daysRemaining: number;
    }
  | { kind: 'refused'; reason: PlanChangeRefusalReason };

/** Whole days between now and the period end, floored at zero. */
function daysUntil(periodEnd: Date, now: Date): number {
  return Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / MS_PER_DAY));
}

/**
 * The share of the current period the team has NOT used yet.
 *
 * Exported for the tests, because this fraction is the whole of the arithmetic
 * and getting it wrong is the difference between a fair charge and an angry
 * message. Clamped to [0, 1]: a period end in the past reads as nothing left
 * (the caller refuses that case anyway) and a period longer than nominal reads
 * as full rather than as more than full.
 */
export function unusedFraction(input: {
  periodEnd: Date;
  now: Date;
  interval: BillingInterval;
}): number {
  const msRemaining = input.periodEnd.getTime() - input.now.getTime();
  const raw = msRemaining / (PERIOD_DAYS[input.interval] * MS_PER_DAY);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

/**
 * What would happen if this team moved to this plan.
 *
 * Returns a refusal rather than throwing, so the route can turn every outcome
 * into copy. Never has a side effect and never talks to anything.
 */
export function quotePlanChange(input: {
  /** subscriptions.plan as stored. May be a legacy id, which is refused. */
  currentPlan: string | null | undefined;
  /** subscriptions.billing_interval, or whatever the resolver made of it. */
  currentInterval: BillingInterval;
  targetTier: string;
  targetInterval: string;
  /** subscriptions.expires_at. */
  periodEndsAt: string | null | undefined;
  now: Date;
}): PlanChangeQuote {
  const current = String(input.currentPlan ?? '').trim();
  const target = input.targetTier;

  // Refused before anything is compared: a tier we cannot price, or a current
  // plan whose real rate this package may not hold.
  if (!isPricingTierId(target)) return { kind: 'refused', reason: 'sales_led_target' };
  if (getTier(target).contactSales) return { kind: 'refused', reason: 'sales_led_target' };
  if (!isPricingTierId(current) || getTier(current).contactSales) {
    return { kind: 'refused', reason: 'legacy_current_plan' };
  }

  if (input.targetInterval !== 'monthly' && input.targetInterval !== 'annual') {
    return { kind: 'refused', reason: 'interval_change' };
  }
  // The interval is fixed for a self-serve change. See the header.
  if (input.targetInterval !== input.currentInterval) {
    return { kind: 'refused', reason: 'interval_change' };
  }
  const interval: BillingInterval = input.currentInterval;

  if (current === target) return { kind: 'refused', reason: 'same_plan' };

  const periodEnd = input.periodEndsAt ? new Date(input.periodEndsAt) : null;
  if (!periodEnd || Number.isNaN(periodEnd.getTime()) || periodEnd <= input.now) {
    // Nothing paid for, so nothing to prorate against. A team in this state
    // belongs in ordinary checkout, not in a change flow.
    return { kind: 'refused', reason: 'no_active_period' };
  }

  const currentPrice = getTierPrice(current, interval)?.minorUnit ?? null;
  const targetPrice = getTierPrice(target, interval)?.minorUnit ?? null;
  if (currentPrice === null || targetPrice === null) {
    return { kind: 'refused', reason: 'sales_led_target' };
  }

  const daysRemaining = daysUntil(periodEnd, input.now);

  // Cheaper or equal is a downgrade, and equal counts as one deliberately: two
  // tiers at the same price is a re-cut we have shipped before (Label's amounts
  // are identical to the legacy plans'), and charging nothing while switching at
  // period end is the safe reading of it.
  if (targetPrice <= currentPrice) {
    return {
      kind: 'downgrade',
      targetTier: target,
      interval,
      effectiveAt: periodEnd.toISOString(),
      daysRemaining,
    };
  }

  const fraction = unusedFraction({ periodEnd, now: input.now, interval });
  const raw = Math.round((targetPrice - currentPrice) * fraction);
  // Below the floor, grant it. See MIN_CHARGEABLE_MINOR_UNIT.
  const amountMinorUnit = raw < MIN_CHARGEABLE_MINOR_UNIT ? 0 : raw;

  return {
    kind: 'upgrade',
    targetTier: target,
    interval,
    amountMinorUnit,
    daysRemaining,
    periodEndsAt: periodEnd.toISOString(),
  };
}

/** Human copy for a refusal. Plain, and it always says what to do next — a
 *  refusal that does not name the alternative is just a dead end. */
export function planChangeRefusalMessage(reason: PlanChangeRefusalReason): string {
  switch (reason) {
    case 'same_plan':
      return 'Your team is already on this plan.';
    case 'interval_change':
      return 'Switching between monthly and annual is something we set up with you. Talk to us and we will sort it out.';
    case 'sales_led_target':
      return 'Enterprise is quoted per contract. Talk to us and we will scope it with you.';
    case 'legacy_current_plan':
      return 'Your team is on an older plan, so we handle changes to it ourselves. Talk to us and we will move you across.';
    case 'no_active_period':
      return 'There is no active plan to change yet. Activate a plan first.';
  }
}
