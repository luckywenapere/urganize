import {
  getTier,
  getTierPrice,
  INTERVAL_MONTHS,
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
//   - A SALES-LED TARGET, or a tier this package has no price for. Nothing on
//     the ladder is sales-led as of 2026-09-09 (Group, id `enterprise`, was
//     removed), but `contactSales` stays generic on PricingTierDefinition, so
//     a future sales-led tier is refused here with no new code.
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
  six_month: 182,
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

/** `change_kind` on a plan-change payments row that is a monthly-to-prepay
 *  switch (a new 6-month or yearly period starting today) rather than a
 *  prorated tier upgrade. Read by the webhook. */
export const PREPAY_SWITCH_KIND = 'prepay_switch';

export type PlanChangeRefusalReason =
  | 'same_plan'
  | 'interval_change'
  | 'sales_led_target'
  | 'legacy_current_plan'
  | 'grandfathered_rate'
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

/**
 * Is this subscription paying something other than today's list price?
 *
 * THE REASON THIS EXISTS: on 2026-09-08 every tier was repriced downward and
 * hard — Solo ₦80,000 → ₦5,000 a year, Manager ₦350,000 → ₦22,000 — and the
 * founder's rule for that reprice is that existing paying accounts keep the
 * price they signed up on. `quotePlanChange` prices a change by reading BOTH
 * ends out of @urganize/pricing, so for anyone who bought before that date the
 * credit side of the arithmetic is a number they have never paid. Left alone it
 * would quote an upgrade against a base sixteen times off.
 *
 * THE COMPARISON IS AGAINST `subscriptions.amount`, which is the last full
 * period charge in kobo — written by the initial purchase and rewritten by every
 * renewal, and deliberately NOT touched by a prorated top-up (see
 * handlePlanChangeCharge in the Paystack webhook). So it means "what a period of
 * this subscription costs", which is exactly the question. Nothing new is
 * stored: no column, no cutoff date, no flag to keep in step. It also
 * self-maintains through the NEXT reprice, because the comparison is always
 * against whatever the package says today.
 *
 * IT FAILS TOWARD GRANDFATHERED, on every uncertainty. Wrongly refusing sends a
 * team to a human who can sort it out in a sentence; wrongly allowing quotes a
 * change against the wrong base and takes the wrong amount of real money, which
 * noticing later does not undo.
 *
 * ONE KNOWN FALSE POSITIVE, accepted: between an upgrade and the next renewal,
 * `amount` still holds the OLD tier's price, so a second change inside the same
 * period is refused. That window is also exactly when the founder still has a
 * Paystack swap to perform by hand (the plan-change flow records the decision
 * and a human moves the subscription), so a further self-serve change genuinely
 * should be a conversation until that has landed.
 */
export function isGrandfatheredRate(input: {
  /** subscriptions.plan as stored. */
  plan: string | null | undefined;
  /** The interval that subscription bills on. */
  interval: BillingInterval;
  /** subscriptions.amount, in kobo. */
  paidMinorUnit: number | null | undefined;
}): boolean {
  const listed = isPricingTierId(input.plan)
    ? (getTierPrice(input.plan, input.interval)?.minorUnit ?? null)
    : null;
  // No list price to compare against: a sales-led tier, a legacy id, or an
  // interval we no longer sell. Every one of those is a conversation anyway.
  if (listed === null) return true;

  const paid = Number(input.paidMinorUnit);
  if (!Number.isFinite(paid) || paid <= 0) return true;

  return paid !== listed;
}

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
  /** subscriptions.amount, in kobo — the last full period charge. REQUIRED
   *  rather than optional on purpose: absent has to mean "refuse" (see
   *  `isGrandfatheredRate`), and an optional field defaulting to that would turn
   *  every caller who forgot it into a silent wall of refusals rather than a
   *  type error. */
  currentPaidMinorUnit: number | null | undefined;
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

  if (
    input.targetInterval !== 'monthly' &&
    input.targetInterval !== 'six_month' &&
    input.targetInterval !== 'annual'
  ) {
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

  // Priced against what they ACTUALLY pay, or not at all. Placed after the
  // cheap identity checks so a team on an old rate asking for the plan they are
  // already on still hears "you are already on this plan", which is the more
  // useful of the two true answers.
  if (
    isGrandfatheredRate({
      plan: current,
      interval,
      paidMinorUnit: input.currentPaidMinorUnit,
    })
  ) {
    return { kind: 'refused', reason: 'grandfathered_rate' };
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
      return 'Moving from monthly to 6 months or yearly is the Switch button on Billing. Any other change of period we set up with you, so talk to us.';
    case 'sales_led_target':
      return 'That plan is quoted per contract, not sold from this page. Talk to us and we will scope it with you.';
    case 'legacy_current_plan':
      return 'Your team is on an older plan, so we handle changes to it ourselves. Talk to us and we will move you across.';
    case 'grandfathered_rate':
      // Never says "you pay more than the new price". It may be less, it may be
      // a comped deal, and either way the number on their invoice is not this
      // page's to discuss. It says what happens next and stops.
      return 'Your team is on the price you signed up at, so we move you ourselves rather than letting the page guess. Talk to us and we will sort it out.';
    case 'no_active_period':
      return 'There is no active plan to change yet. Activate a plan first.';
  }
}
// ---------------------------------------------------------------- prepay switch

/** A monthly team buying a 6-month or yearly period of the SAME tier (founder,
 *  2026-10-22, mock b). Pay now; the unused days of the current month come off;
 *  the new period starts today. It is a new purchase, so it is priced at today's
 *  list price even for a team on an older monthly rate, and the credit is what
 *  they actually paid for the days they have not used. */
export type PrepaySwitchQuote =
  | {
      kind: 'prepay_switch';
      tier: PricingTierId;
      fromInterval: 'monthly';
      interval: BillingInterval;
      /** The new period's full price, kobo. What every renewal charges. */
      fullPriceMinorUnit: number;
      /** What comes off for the unused days of the current month, kobo. */
      creditMinorUnit: number;
      /** What to charge now, kobo. */
      amountMinorUnit: number;
      daysRemaining: number;
      startsAt: string;
      renewsAt: string;
    }
  | { kind: 'refused'; reason: PlanChangeRefusalReason };

/** True when this request is a monthly-to-prepay switch rather than a tier
 *  change: same tier, monthly now, 6 months or yearly asked for. */
export function isPrepaySwitchRequest(input: {
  currentPlan: string | null | undefined;
  currentInterval: BillingInterval;
  targetTier: string;
  targetInterval: string;
}): boolean {
  return (
    String(input.currentPlan ?? '').trim() === input.targetTier &&
    input.currentInterval === 'monthly' &&
    (input.targetInterval === 'six_month' || input.targetInterval === 'annual')
  );
}

/** The new period's end: `start` plus the interval's months. */
export function prepayPeriodEnd(start: Date, interval: BillingInterval): Date {
  const end = new Date(start);
  end.setMonth(end.getMonth() + INTERVAL_MONTHS[interval]);
  return end;
}

export function quotePrepaySwitch(input: {
  currentPlan: string | null | undefined;
  currentInterval: BillingInterval;
  targetInterval: string;
  periodEndsAt: string | null | undefined;
  /** subscriptions.amount, kobo: what a month of this subscription costs. */
  currentPaidMinorUnit: number | null | undefined;
  now: Date;
}): PrepaySwitchQuote {
  const current = String(input.currentPlan ?? '').trim();
  if (!isPricingTierId(current) || getTier(current).contactSales) {
    return { kind: 'refused', reason: 'legacy_current_plan' };
  }
  if (input.currentInterval !== 'monthly') return { kind: 'refused', reason: 'interval_change' };
  if (input.targetInterval !== 'six_month' && input.targetInterval !== 'annual') {
    return { kind: 'refused', reason: 'interval_change' };
  }
  const interval: BillingInterval = input.targetInterval;

  const periodEnd = input.periodEndsAt ? new Date(input.periodEndsAt) : null;
  if (!periodEnd || Number.isNaN(periodEnd.getTime()) || periodEnd <= input.now) {
    return { kind: 'refused', reason: 'no_active_period' };
  }

  const fullPrice = getTierPrice(current, interval)?.minorUnit ?? null;
  if (fullPrice === null) return { kind: 'refused', reason: 'sales_led_target' };

  // The credit is what THEY paid, so it must be known. Unknown fails toward a
  // human, the isGrandfatheredRate rule.
  const paid = Number(input.currentPaidMinorUnit);
  if (!Number.isFinite(paid) || paid <= 0) return { kind: 'refused', reason: 'grandfathered_rate' };

  const fraction = unusedFraction({ periodEnd, now: input.now, interval: 'monthly' });
  const credit = Math.min(fullPrice, Math.round(paid * fraction));
  const amount = fullPrice - credit;

  return {
    kind: 'prepay_switch',
    tier: current,
    fromInterval: 'monthly',
    interval,
    fullPriceMinorUnit: fullPrice,
    creditMinorUnit: credit,
    amountMinorUnit: amount,
    daysRemaining: daysUntil(periodEnd, input.now),
    startsAt: input.now.toISOString(),
    renewsAt: prepayPeriodEnd(input.now, interval).toISOString(),
  };
}
