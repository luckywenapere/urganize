// Server-only billing config — env-driven Paystack plan codes + period math.
//
// All Paystack plan codes are read from environment variables, never
// hardcoded. The user manages plan creation in the Paystack dashboard and
// supplies the resulting plan code (PLN_xxx) via env. This decoupling lets
// keys be swapped between test and live without a code change.
//
// Module is server-only — never import from a client component.
// Never re-export plan codes through any client-bundled path.

import {
  BILLING_PLANS,
  PRICING_TIER_ORDER,
  getTierPrice,
  isBillingInterval,
  isBillingPlanId,
  type BillingInterval,
  type BillingPlanId,
  type PricingCurrencyCode,
  type PricingTierId,
} from '@urganize/pricing';

/**
 * Every plan string that represents a live recurring subscription.
 *
 * Two generations sit in here, and the difference is the whole reason this
 * module changed. A LEGACY id ('monthly' | 'annual') literally IS its billing
 * interval. A TIER id ('manager' | 'label') is not: a tier says who the customer
 * is, and the interval they bought is a separate fact, stored on
 * `subscriptions.billing_interval`. Anything reading an interval off a plan name
 * must go through `resolveBillingInterval` rather than matching strings.
 *
 * 'enterprise' is deliberately absent. It is `contactSales` — quoted per
 * contract and invoiced by hand — so it has no Paystack plan code and must never
 * reach self-serve checkout or the renewal path.
 */
export type RecurringPlanId = BillingPlanId | 'manager' | 'solo';

/** The tiers a customer can actually buy without talking to us.
 *
 * SOLO AND MANAGER since 2026-09-01 (founder call). Solo had been on the public
 * pricing page at ₦8,000 since 2026-08-30 while being absent from here, which
 * made every one of its four ceilings unreachable dead code — advertised, and
 * enforced on nobody, because `resolveTeamTier` could never return a tier no
 * code path could write.
 *
 * Label and Group stay OUT: both are sales-led, so their path is the
 * talk-to-us card rather than a radio. Note this is about NEW purchases — an
 * existing Label subscription still renews, because `isRecurringPlan` below
 * still accepts 'label'. The two lists answer different questions and are meant
 * to disagree there. */
export type SelfServeTierId = Extract<PricingTierId, 'manager' | 'solo'>;

export function isSelfServeTier(value: unknown): value is SelfServeTierId {
  return value === 'manager' || value === 'solo';
}

/**
 * How often does this subscription bill?
 *
 * THE ONE PLACE the plan-name-vs-stored-interval ambiguity is settled, and the
 * reason it exists: under the tier model `subscriptions.plan` stopped encoding
 * the interval, so a Label-monthly and a Label-annual row are identical apart
 * from this field. Every caller that needs a period length asks here.
 *
 * Order matters:
 *   1. A stored interval always wins. It is what the customer actually bought,
 *      recorded at checkout time from the Paystack plan they were sent to.
 *   2. Otherwise infer from a legacy plan name, which for those ids IS the
 *      interval. This is what keeps every pre-existing row behaving exactly as
 *      it did before this column existed.
 *   3. Otherwise MONTHLY. Deliberately the short one: under-granting a month is
 *      recoverable (the next renewal extends it, and a support message fixes
 *      it), while over-granting a year gives away eleven months of product for
 *      free with no mechanism to claw it back.
 */
export function resolveBillingInterval(input: {
  plan: string | null | undefined;
  /** subscriptions.billing_interval, or the checkout's selected_interval. */
  storedInterval?: string | null;
}): BillingInterval {
  const stored = String(input.storedInterval || '').trim();
  if (stored === 'monthly' || stored === 'annual') return stored;

  const plan = String(input.plan || '').trim();
  // The legacy ids, where the name is the interval. 'label' is included
  // because the LEGACY label plan was the ₦800,000/yr roster tier; a stored
  // interval takes precedence above, so a pricing-v2 Label row is unaffected.
  if (plan === 'annual' || plan === 'yearly' || plan === 'label' || plan === 'access') {
    return 'annual';
  }
  return 'monthly';
}

// Map of (plan, currency) → env var name that holds the Paystack plan
// code. Defined as a constant so a typo in any one branch surfaces here,
// not in a "plan not configured" error at checkout time.
//
// LEGACY GENERATION ONLY — the plan id is the interval, so (plan, currency) is
// enough to name one Paystack Plan. Tier purchases need a third dimension; see
// TIER_PLAN_CODE_ENV_VAR below.
const PLAN_CODE_ENV_VAR: Record<BillingPlanId, Record<PricingCurrencyCode, string>> = {
  monthly: {
    NGN: 'PAYSTACK_PLAN_MONTHLY_NGN',
    USD: 'PAYSTACK_PLAN_MONTHLY_USD',
  },
  annual: {
    NGN: 'PAYSTACK_PLAN_ANNUAL_NGN',
    USD: 'PAYSTACK_PLAN_ANNUAL_USD',
  },
  label: {
    NGN: 'PAYSTACK_PLAN_LABEL_NGN',
    USD: 'PAYSTACK_PLAN_LABEL_USD',
  },
};

// Map of (tier, interval) → env var name, for pricing v2.
//
// NGN ONLY, and that is honest rather than lazy: PRICING_TIERS carries NGN
// prices alone, the Paystack account only offers NGN in plan creation, and USD
// checkout has never worked on any tier (there are no PAYSTACK_PLAN_*_USD vars
// set anywhere). Inventing four USD entries here would let a USD tier checkout
// get one step further before failing, which is worse than refusing it plainly.
//
// ⚠️ LABEL REUSES THE LIVE MONTHLY/ANNUAL PLANS ON PURPOSE. The tier's prices
// are byte-identical to BILLING_PLANS.monthly / .annual (₦80,000 / ₦800,000 —
// pinned by a test in packages/pricing), which is the entire reason the tier
// rollout needs no new Plan objects for it and no existing subscriber changes
// price. Do NOT repoint these at PAYSTACK_PLAN_LABEL_*: that var holds a
// mislabeled ₦750,000 Plan from an earlier attempt (CLAUDE.md records it), and
// pointing Label at it would charge every new Label customer the wrong amount.
//
// Solo and Manager are the tiers needing their own Plan objects minted. Until a
// tier's two env vars are set, its checkout returns the "plan not configured"
// 500 — which is the correct failure: it refuses rather than charging a Plan
// that bills the wrong amount or term.
//
// SOLO'S PLANS ARE MINTED (2026-09-01), at ₦8,000/mo and ₦80,000/yr, matching
// PRICING_TIERS. Both env vars were set BEFORE the code shipped, which is the
// first time in this repo's history the order of operations has been followed on
// the first attempt rather than corrected afterwards. Note the Plan objects are
// named `monthly` and `yearly` in the Paystack dashboard rather than
// `PAYSTACK_PLAN_SOLO_*` like Manager's — the amount is what identifies them.
//
// Label's entry moved to RETIRED_TIER_PLAN_CODE_ENV_VAR on 2026-08-30 when it
// became sales-led: no longer purchasable, so it must not be reachable from
// checkout, but its live subscriptions still renew and are still validated.
const TIER_PLAN_CODE_ENV_VAR: Record<SelfServeTierId, Record<BillingInterval, string>> = {
  solo: {
    monthly: 'PAYSTACK_PLAN_SOLO_MONTHLY_NGN',
    annual: 'PAYSTACK_PLAN_SOLO_ANNUAL_NGN',
  },
  manager: {
    monthly: 'PAYSTACK_PLAN_MANAGER_MONTHLY_NGN',
    annual: 'PAYSTACK_PLAN_MANAGER_ANNUAL_NGN',
  },
};

/**
 * Tiers we no longer sell but still renew. Read ONLY by
 * `planCodeMatchesSubscription`, never by checkout — that separation is the
 * point: a retired tier must be impossible to buy while its existing
 * subscriptions stay judged against the Plans they were actually sold on.
 *
 * Label maps to the LIVE monthly/annual Plans, not PAYSTACK_PLAN_LABEL_* — its
 * tier prices were identical to those plans by design, so that is what its
 * subscribers are really billed against. PAYSTACK_PLAN_LABEL_NGN holds a
 * mislabeled ₦750,000 Plan from an earlier attempt and must never be used here.
 *
 * Keyed loosely by string because these ids are precisely the ones no longer in
 * SelfServeTierId.
 */
const RETIRED_TIER_PLAN_CODE_ENV_VAR: Record<string, Record<BillingInterval, string>> = {
  label: {
    monthly: 'PAYSTACK_PLAN_MONTHLY_NGN',
    annual: 'PAYSTACK_PLAN_ANNUAL_NGN',
  },
};

function readPlanCodeEnv(envName: string | undefined): string | null {
  if (!envName) return null;
  const value = process.env[envName];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolve the Paystack plan code (PLN_xxx) for a given plan + currency
 * combo. Returns the env var value verbatim, trimmed; returns null if the
 * env var is unset or empty. Caller is responsible for surfacing a
 * user-readable error ("plan not configured") on null.
 */
export function getPaystackPlanCode(
  plan: BillingPlanId,
  currency: PricingCurrencyCode
): string | null {
  return readPlanCodeEnv(PLAN_CODE_ENV_VAR[plan]?.[currency]);
}

/**
 * The pricing-v2 equivalent: resolve a Paystack plan code from a tier plus the
 * interval the customer chose. Null when the env var is unset, which the caller
 * must surface as "plan not configured" rather than falling back to anything.
 *
 * A separate function rather than a third argument on the one above, on purpose.
 * 'label' exists in BOTH generations, so a single overloaded resolver would have
 * to guess which one a caller meant from the presence of an argument — and
 * guessing wrong sends a customer to a Plan that bills a different term. Two
 * functions make the caller say which generation it is buying.
 */
export function getTierPaystackPlanCode(
  tier: SelfServeTierId,
  interval: BillingInterval
): string | null {
  return readPlanCodeEnv(TIER_PLAN_CODE_ENV_VAR[tier]?.[interval]);
}

/**
 * The tiers this deployment can actually CHARGE, in pricing-page order.
 *
 * A tier qualifies only when it is self-serve AND both of its Paystack Plan
 * codes are configured — because a tier missing either one is a radio button
 * that ends in a 500, and the customer who clicked it has no way to know that
 * was our configuration rather than their card.
 *
 * THIS EXISTS TO CLOSE A GAP THIS REPO HAS SHIPPED FOUR TIMES (2026-07-14,
 * -07-15, -08-16, -08-21), each time as a price advertised that nothing could
 * charge, and each time caught by a customer or a founder rather than by code.
 * Every previous fix was a reminder to mint the Plans first. This one makes the
 * order of operations unnecessary: an unmintable tier simply is not offered, and
 * it starts being offered the moment its env vars are set, with no code change.
 *
 * Server-only, because it reads env. The wall receives the answer through
 * /api/subscription-status rather than deriving it, which is the whole point —
 * a client bundle cannot see whether a Plan exists.
 *
 * BOTH intervals are required rather than either, deliberately: the wall's
 * interval toggle is always live, so offering a tier that can only be billed
 * monthly would move the failure one click later instead of removing it.
 */
export function purchasableTiers(): PricingTierId[] {
  return PRICING_TIER_ORDER.filter(
    (tier) =>
      isSelfServeTier(tier) &&
      getTierPaystackPlanCode(tier, 'monthly') !== null &&
      getTierPaystackPlanCode(tier, 'annual') !== null
  );
}

/**
 * Does an incoming Paystack plan code match what we believe this subscription
 * is on? Used by the webhook's renewal sanity check.
 *
 * FORWARD-resolving (stored plan → expected code) rather than reverse-mapping
 * the incoming code, and that is what makes it unambiguous: because Label reuses
 * the legacy monthly/annual Plans, one code reverse-maps to BOTH legacy
 * 'monthly' and 'label' at monthly. A reverse lookup would therefore report a
 * mismatch on every single Label renewal — log noise on our flagship tier, for a
 * check that is only meant to catch a genuine Paystack-side plan migration.
 *
 * Unknown-vs-unknown returns true: an absent code is not evidence of a mismatch,
 * and this check must never be the thing that blocks a renewal.
 */
export function planCodeMatchesSubscription(input: {
  code: string | null | undefined;
  plan: string;
  storedInterval?: string | null;
}): boolean {
  const incoming = String(input.code || '').trim();
  if (!incoming) return true;

  const expected: Array<string | null> = [];
  const retired = RETIRED_TIER_PLAN_CODE_ENV_VAR[input.plan];
  if (isSelfServeTier(input.plan)) {
    const interval = resolveBillingInterval({
      plan: input.plan,
      storedInterval: input.storedInterval,
    });
    expected.push(getTierPaystackPlanCode(input.plan, interval));
  } else if (retired) {
    // A tier we stopped selling but still renew. Judged interval-sensitively,
    // exactly as it was while it was on sale — dropping to the legacy branch
    // below would read PAYSTACK_PLAN_LABEL_* (never set), find nothing
    // configured, and quietly stop checking these renewals at all.
    const interval = resolveBillingInterval({
      plan: input.plan,
      storedInterval: input.storedInterval,
    });
    expected.push(readPlanCodeEnv(retired[interval]));
  } else if (input.plan === 'monthly' || input.plan === 'annual' || input.plan === 'label') {
    for (const currency of ['NGN', 'USD'] as const) {
      expected.push(getPaystackPlanCode(input.plan, currency));
    }
  }

  const configured = expected.filter((code): code is string => Boolean(code));
  // Nothing configured for this plan means we cannot judge — say nothing rather
  // than warning on every renewal in an environment with partial env vars.
  if (configured.length === 0) return true;
  return configured.includes(incoming);
}

/**
 * Reverse lookup — given a Paystack plan code, identify which of our
 * recurring tiers it represents. Used by the webhook to validate that an
 * incoming subscription/charge event matches a plan we expect, and to
 * decide how far to extend `expires_at` on renewal.
 *
 * Returns null when the code matches no configured plan (unknown plan, or
 * env vars not yet set).
 */
export function identifyPlanByCode(
  paystackPlanCode: string | null | undefined
): { plan: RecurringPlanId; currency: PricingCurrencyCode } | null {
  const target = String(paystackPlanCode || '').trim();
  if (!target) return null;

  for (const plan of ['monthly', 'annual', 'label'] as const) {
    for (const currency of ['NGN', 'USD'] as const) {
      if (getPaystackPlanCode(plan, currency) === target) {
        return { plan, currency };
      }
    }
  }
  return null;
}

// NOTE on identifyPlanByCode and pricing v2: it scans the LEGACY map only, and
// that is deliberate. Reverse-mapping a code cannot distinguish legacy 'monthly'
// from tier 'label' at a monthly interval, because they are the same Paystack
// Plan by design. Anything that needs to compare a code against a subscription
// should call planCodeMatchesSubscription above, which resolves forward and so
// has no ambiguity to guess at. This function survives for the currency it can
// report in logs, and for the legacy-only paths that predate tiers.

/**
 * How long the new `expires_at` should be after a successful charge for
 * each plan. Used on the initial charge AND every renewal.
 *
 * On renewal, the webhook reads the current `expires_at` and advances by
 * one period — NOT `now + period`. This way a renewal that arrives a day
 * late (Paystack retry, slow webhook delivery) doesn't shorten the user's
 * paid window.
 */
export function advancePeriodEnd(
  plan: RecurringPlanId,
  currentEnd: Date | null,
  now: Date,
  /** subscriptions.billing_interval. Optional so every pre-tier call site keeps
   *  its exact behaviour; required in practice for a tier plan, where the name
   *  cannot tell you the period. */
  storedInterval?: string | null
): Date {
  // Base is whichever is later: the current period end (so we extend, not
  // truncate) or now (so a long-cancelled customer who pays again starts
  // a fresh period from today, not from their old expires_at).
  const base = currentEnd && currentEnd.getTime() > now.getTime() ? new Date(currentEnd) : new Date(now);
  // Period length comes from resolveBillingInterval, never from matching the
  // plan name here: under pricing v2 the name does not carry it.
  if (resolveBillingInterval({ plan, storedInterval }) === 'annual') {
    base.setFullYear(base.getFullYear() + 1);
  } else {
    base.setMonth(base.getMonth() + 1);
  }
  return base;
}

/**
 * The set of plan strings that represent a "fresh recurring charge"
 * outcome — anything that should advance expires_at and flip status to
 * active. Excludes 'access' (legacy one-time SKU; grandfathered users only)
 * and 'custom' (admin-provisioned).
 */
export const RECURRING_PLAN_IDS: readonly RecurringPlanId[] = [
  'monthly',
  'annual',
  'label',
  'manager',
  'solo',
] as const;

/**
 * Is this plan string a live recurring subscription?
 *
 * This gate is load-bearing on the renewal path: the webhook bails with
 * `non_recurring_subscription` when it returns false, which means a plan missing
 * from here has its renewals SILENTLY STOP EXTENDING. That is exactly what
 * happened to the tier ids before this change.
 *
 * 'enterprise' stays out: it is invoiced by hand, has no Paystack plan code, and
 * an enterprise row's expires_at is set by an admin, not by a charge event.
 *
 * 'label' STAYS IN, even though Label became sales-led on 2026-08-30 and is no
 * longer in `SelfServeTierId`. It was self-serve for the whole pricing-v2
 * launch window, so live `label` subscriptions exist against real Paystack
 * Plans; dropping it here would silently stop extending them at their next
 * renewal — the precise failure this comment block was written about. Whether a
 * tier can be BOUGHT today and whether an existing subscription RENEWS are
 * different questions.
 *
 * 'solo' was added 2026-09-01, in the same pass that made it self-serve. Adding
 * it here is not optional bookkeeping: a Solo subscription whose id is missing
 * from this list would charge correctly on day one and then quietly stop
 * extending at the first renewal, leaving a paying customer walled with no
 * failure anywhere to point at.
 */
export function isRecurringPlan(plan: string): plan is RecurringPlanId {
  return (
    plan === 'monthly' ||
    plan === 'annual' ||
    plan === 'label' ||
    plan === 'manager' ||
    plan === 'solo'
  );
}

/**
 * Whole-unit display amount for a plan + currency. Re-exported here so the
 * server checkout init can pass `amount` to Paystack without round-trip
 * through the shared package on every call. Lives here so callers stay on
 * the server-only module and don't accidentally import the whole pricing
 * package from a server-only callsite (which would also work, but adds
 * one more module to keep an eye on).
 */
export function getPlanMinorUnit(plan: BillingPlanId, currency: PricingCurrencyCode): number {
  return BILLING_PLANS[plan].prices[currency].minorUnit;
}

/**
 * The pricing-v2 equivalent. Null on a tier/interval with no price, which today
 * means only 'enterprise' — and `SelfServeTierId` already excludes it, so null
 * here signals a pricing-package edit that removed a price rather than a caller
 * mistake. Callers must refuse the checkout on null; sending Paystack a
 * fabricated amount is the one outcome worse than failing.
 *
 * NGN only, matching TIER_PLAN_CODE_ENV_VAR and PRICING_TIERS.
 */
export function getTierMinorUnit(
  tier: SelfServeTierId,
  interval: BillingInterval
): number | null {
  return getTierPrice(tier, interval)?.minorUnit ?? null;
}

/**
 * Resolve one checkout request into the three things Paystack needs: which Plan
 * to bill against, how much, and (for a tier) which interval to record.
 *
 * Extracted out of the route so it can be unit tested, and that is not
 * ceremony: this function decides which Paystack Plan object a customer's card
 * is charged against. Getting it wrong bills the wrong amount for the wrong
 * term, and the route itself is unreachable from a test without mocking
 * Supabase and fetch — so the decision lives here, where it is testable, and
 * the route stays a thin caller.
 *
 * BOTH GENERATIONS ARE ACCEPTED while pricing v2 is on. The live paywall still
 * posts legacy ids, so refusing them the moment the flag flips would break
 * checkout for everyone; and a legacy id is unambiguous anyway, because there
 * the id IS the interval.
 *
 * Error precedence is deliberate: identity of the plan first (a sales-led tier
 * gets its own message rather than being listed as an invalid id), then the
 * shape of the request, then configuration. A caller should never see "plan not
 * configured" for a request that was malformed to begin with.
 */
export type CheckoutPurchase =
  | {
      ok: true;
      /** What to write to payments.plan and subscriptions.plan. */
      planId: string;
      /** Paystack Plan code (PLN_xxx). */
      planCode: string;
      amountMinorUnit: number;
      /** Non-null only for a tier purchase; this is what gets persisted so
       *  renewals know the period. */
      interval: BillingInterval | null;
    }
  | { ok: false; status: 400 | 500; error: string };

export function resolveCheckoutPurchase(input: {
  plan: unknown;
  currency: PricingCurrencyCode;
  interval: unknown;
  /** isPricingV2Enabled() — passed in rather than read here so this stays pure
   *  with respect to the flag and both states are testable. */
  pricingV2: boolean;
}): CheckoutPurchase {
  const { plan, currency, pricingV2 } = input;

  // Sales-led, so there is nothing to check out. Answered first so the message
  // says what to do instead of listing ids that do not include this one.
  if (plan === 'enterprise') {
    return {
      ok: false,
      status: 400,
      error: 'Group is quoted per contract. Contact us rather than checking out.',
    };
  }

  if (pricingV2 && isSelfServeTier(plan)) {
    if (!isBillingInterval(input.interval)) {
      return { ok: false, status: 400, error: 'interval must be "monthly" or "annual".' };
    }
    // NGN only, and refused plainly rather than half-attempted: PRICING_TIERS
    // carries no USD prices, the Paystack account offers NGN alone in plan
    // creation, and no PAYSTACK_PLAN_*_USD var has ever been set anywhere.
    if (currency !== 'NGN') {
      return {
        ok: false,
        status: 400,
        error: 'Plans are billed in Naira. Switch the currency to NGN to continue.',
      };
    }
    const interval = input.interval;
    const amountMinorUnit = getTierMinorUnit(plan, interval);
    if (amountMinorUnit === null) {
      // A pricing-package edit removed a price. Refuse rather than invent an
      // amount — sending Paystack a fabricated figure is the one outcome worse
      // than failing the checkout.
      return { ok: false, status: 500, error: `No price configured for ${plan}/${interval}.` };
    }
    const planCode = getTierPaystackPlanCode(plan, interval);
    if (!planCode) {
      return {
        ok: false,
        status: 500,
        error: `Paystack plan code not configured for ${plan}/${interval}. Set the matching PAYSTACK_PLAN_* env var.`,
      };
    }
    return { ok: true, planId: plan, planCode, amountMinorUnit, interval };
  }

  if (!isBillingPlanId(plan)) {
    return { ok: false, status: 400, error: 'plan must be "monthly", "annual", or "label".' };
  }
  if (!isRecurringPlan(plan)) {
    // Belt-and-braces — isBillingPlanId already narrows to the recurring
    // tiers, but a future cleanup migration may introduce extra plan strings.
    return { ok: false, status: 400, error: 'Plan is not a recurring tier.' };
  }
  const planCode = getPaystackPlanCode(plan, currency);
  if (!planCode) {
    return {
      ok: false,
      status: 500,
      error: `Paystack plan code not configured for ${plan}/${currency}. Set the matching PAYSTACK_PLAN_* env var.`,
    };
  }
  return {
    ok: true,
    planId: plan,
    planCode,
    amountMinorUnit: getPlanMinorUnit(plan, currency),
    interval: null,
  };
}

/**
 * Grace period buffer applied when looking at past_due subscriptions. The
 * snapshot resolver in lib/subscription-access.ts treats past_due + not
 * expired as paid, so this constant is informational only — exported in
 * case a future "you're past due" banner wants to show the cutoff.
 */
export const PAYSTACK_RETRY_GRACE_DAYS = 3;
