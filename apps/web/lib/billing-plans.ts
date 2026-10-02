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
  PRICING_TIERS,
  PRICING_TIER_ORDER,
  SELLABLE_INTERVALS,
  getTierPrice,
  isBillingInterval,
  isBillingPlanId,
  isPricingTierId,
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
 * 'enterprise' (Group) is absent: it is `contactSales`, quoted per deal and
 * recorded by hand in /admin/teams, so it has no Paystack plan code and never
 * reaches self-serve checkout or the renewal path. (It was removed 2026-09-09
 * and came back 2026-10-02 the same way.)
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
 * LABEL REJOINED 2026-09-08 (founder call), in the annual-only reprice that gave
 * it a ₦50,000/year price. It had been sales-led since 2026-08-30.
 *
 * GROUP (id 'enterprise') IS EXCLUDED, being sales-led; it came back 2026-10-02
 * after the removal described next. It was the one
 * sales-led tier — quoted per contract, no price, no Paystack Plan, talk-to-us
 * card rather than a radio — for the one day between Label getting a price and
 * the founder removing it, 2026-09-09. Since 2026-10-02 it is back, still
 * sales-led, so `SelfServeTierId` is `PricingTierId` minus 'enterprise'.
 *
 * This is about NEW purchases only. An existing subscription on any of these
 * ids renews regardless, because `isRecurringPlan` below is a separate list
 * answering a separate question — whether a tier can be BOUGHT today and
 * whether a live subscription still EXTENDS are meant to be able to disagree. */
export type SelfServeTierId = Extract<PricingTierId, 'manager' | 'solo' | 'label'>;

export function isSelfServeTier(value: unknown): value is SelfServeTierId {
  return value === 'manager' || value === 'solo' || value === 'label';
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

// Which Paystack Plan each self-serve tier is sold on.
//
// ONE ENV VAR PER TIER, NOT ONE PER TIER AND INTERVAL, since 2026-09-08: every
// tier is billed once a year now, so the interval dimension collapsed. A
// monthly tier purchase is refused before it ever gets here (see
// `getTierPaystackPlanCode` and `resolveCheckoutPurchase`), which means there is
// no monthly Plan to name and no way to accidentally name one.
//
// NGN ONLY, and that is honest rather than lazy: PRICING_TIERS carries NGN
// prices alone, the Paystack account only offers NGN in plan creation, and USD
// checkout has never worked on any tier (there are no PAYSTACK_PLAN_*_USD vars
// set anywhere). Inventing USD entries here would let a USD tier checkout get
// one step further before failing, which is worse than refusing it plainly.
//
// ⚠️ THESE ARE NEW VAR NAMES, AND THE NEWNESS IS THE SAFETY MECHANISM. Read this
// before "tidying" them back onto the _ANNUAL_ names below.
//
// The 2026-09-08 reprice moved every amount (Solo ₦80,000 → ₦5,000, Manager
// ₦350,000 → ₦22,000, Label new at ₦50,000), and a Paystack Plan's amount is
// FIXED WHEN THE PLAN IS CREATED. So the new prices need new Plan objects, and
// the dangerous question is what happens if this code ships before somebody
// mints them.
//
// Reusing PAYSTACK_PLAN_SOLO_ANNUAL_NGN would answer that badly: it is already
// set, and it points at the ₦80,000 Plan. The page would advertise ₦5,000 and
// the card would be charged ₦80,000 — a sixteen-fold overcharge, discovered by
// a customer reading their bank statement. That is the advertise-versus-charge
// gap this repo has shipped FIVE times (2026-07-14, -07-15, -08-16, -08-21, and
// the Manager tier), every time caught by a person rather than by code.
//
// A name nothing has set yet inverts the failure. Ship before minting and
// `purchasableTiers()` below finds no code, withholds the tier, and the wall
// shows one less card — visible immediately, and nobody is charged anything.
// Set the var, REBUILD, and the tier starts being offered with no code change.
//
// ⚠️ THIS SAID "WITH NO DEPLOY" UNTIL 2026-09-11, AND THAT WAS WRONG. Vercel
// snapshots env vars per deployment, so a var set after a build never reaches
// the deployment already running. Activating the monthly/yearly reprice needed
// a `vercel redeploy` of the live production deployment before the app could
// see any of the six new Plans at all.
//
// What purchasableTiers() actually guarantees is the failure MODE — ship before
// minting and the tier is WITHHELD rather than mischarged — which is a claim
// about what goes wrong, not about deployment mechanics. The two were
// conflated. Reusing a live var name is still the one thing that defeats it, so
// THE ORDER OF OPERATIONS IS SAFE IN EITHER DIRECTION rather than unnecessary:
// mint first or ship first, but redeploy before expecting either to show up.
//
// ⚠️ _YEARLY_ IS NOT _ANNUAL_. The two are synonyms in English and different
// vars here: _YEARLY_ is the live one this map reads, _ANNUAL_ is superseded and
// read only by the renewal sanity check below. Setting the wrong one leaves the
// tier unoffered, which is the harmless direction, but it will look like the
// deploy did nothing.
//
// ⚠️ AND PAYSTACK_PLAN_LABEL_YEARLY_NGN IS NOT PAYSTACK_PLAN_LABEL_NGN. That
// second one already exists and holds a mislabeled ₦750,000 Plan from an early
// attempt; it sits in the legacy map above, where it has never been reachable
// because the legacy `label` plan is refused at checkout.
//
// Label is in this map at all because it stopped being sales-led on 2026-09-08.
// Its tier price used to be byte-identical to the legacy annual plan, which is
// why it once shared that Plan object; at ₦50,000 it does not.
const TIER_PLAN_CODE_ENV_VAR: Record<SelfServeTierId, Record<BillingInterval, string>> = {
  solo: {
    monthly: 'PAYSTACK_PLAN_SOLO_PER_MONTH_NGN',
    annual: 'PAYSTACK_PLAN_SOLO_PER_YEAR_NGN',
  },
  manager: {
    monthly: 'PAYSTACK_PLAN_MANAGER_PER_MONTH_NGN',
    annual: 'PAYSTACK_PLAN_MANAGER_PER_YEAR_NGN',
  },
  label: {
    monthly: 'PAYSTACK_PLAN_LABEL_PER_MONTH_NGN',
    annual: 'PAYSTACK_PLAN_LABEL_PER_YEAR_NGN',
  },
};

/**
 * Plan objects a tier USED to be sold on, read ONLY by
 * `planCodeMatchesSubscription` and never by checkout.
 *
 * That separation is the point: a superseded Plan must be impossible to buy
 * while the subscriptions already bound to it stay judged against the Plan they
 * were actually sold on. A Paystack subscription is bound to its Plan at
 * creation, so repointing the vars above changes what NEW customers are charged
 * and nothing at all about what existing ones pay — which is exactly the
 * "existing subscribers stay on what they have" half of the reprice, and it is
 * a property of Paystack rather than something this code has to enforce.
 *
 * Without these entries the renewal sanity check would compare an old
 * subscriber's incoming plan code against the NEW Plan, find a mismatch, and log
 * a warning on every renewal of theirs. It never blocks — the webhook logs and
 * continues by design — so this is noise control rather than correctness.
 *
 * Label's entries are the legacy monthly/annual Plans because that is genuinely
 * what a pricing-v2-era Label subscriber was billed against; the tier's price
 * was identical to those plans by design. PAYSTACK_PLAN_LABEL_NGN is deliberately
 * NOT here: nothing was ever sold on it.
 *
 * THE _ANNUAL_ AND _MONTHLY_ VARS LIVE HERE NOW. They are the pre-2026-09-08
 * Plans, still set in the environment, and keeping them named is what stops an
 * older subscriber's renewal logging a warning every year forever. Nothing sells
 * against them — see the deliberately different names in the map above.
 *
 * Label's legacy entries are the shared monthly/annual Plans, because that is
 * genuinely what a pricing-v2-era Label subscriber was billed against: the
 * tier's price was identical to those Plans by design.
 * PAYSTACK_PLAN_LABEL_NGN is deliberately absent — nothing was ever sold on it.
 */
const SUPERSEDED_TIER_PLAN_CODE_ENV_VARS: Record<string, readonly string[]> = {
  solo: [
    'PAYSTACK_PLAN_SOLO_YEARLY_NGN',
    'PAYSTACK_PLAN_SOLO_ANNUAL_NGN',
    'PAYSTACK_PLAN_SOLO_MONTHLY_NGN',
  ],
  manager: [
    'PAYSTACK_PLAN_MANAGER_YEARLY_NGN',
    'PAYSTACK_PLAN_MANAGER_ANNUAL_NGN',
    'PAYSTACK_PLAN_MANAGER_MONTHLY_NGN',
  ],
  label: [
    'PAYSTACK_PLAN_LABEL_YEARLY_NGN',
    'PAYSTACK_PLAN_MONTHLY_NGN',
    'PAYSTACK_PLAN_ANNUAL_NGN',
  ],
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
  // Both intervals again since 2026-09-10, so the interval genuinely selects a
  // Plan rather than being checked and discarded. Getting it wrong now bills the
  // wrong TERM rather than returning null, which is why the two var names are as
  // far apart as PER_MONTH and PER_YEAR.
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
 * ONE CODE IS NOW ENOUGH. This required BOTH a monthly and an annual code until
 * 2026-09-08, because the wall carried an interval toggle and a tier that could
 * only be billed one way moved the failure one click later instead of removing
 * it. The toggle is gone and there is one interval, so requiring a monthly code
 * would now make every tier unpurchasable — which is the single sharpest way
 * this reprice could have taken checkout down without a test failing anywhere.
 */
export function purchasableTiers(): PricingTierId[] {
  return PRICING_TIER_ORDER.filter(
    (tier) =>
      isSelfServeTier(tier) &&
      // BOTH intervals, because both are offered. A tier with only one Plan
      // minted would render an interval toggle where one side 500s at checkout,
      // and a customer who happened to pick that side would read it as the
      // product being broken. Withholding the whole tier until both exist keeps
      // the fresh-var-name guarantee intact: ship before minting and the card
      // simply does not appear, rather than half-appearing.
      SELLABLE_INTERVALS.every(
        (interval) => getTierPaystackPlanCode(tier, interval) !== null
      )
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
  const superseded = SUPERSEDED_TIER_PLAN_CODE_ENV_VARS[input.plan];
  if (isSelfServeTier(input.plan)) {
    // EVERY Plan this tier has ever been sold on, not just today's. A tier is
    // repriced by minting a new Plan and repointing its var, so a subscriber
    // from before the reprice legitimately renews against a code that is no
    // longer the current one. Judging them against the new Plan alone would
    // warn on every renewal of theirs for the rest of their life.
    // BOTH intervals, because a subscriber's stored interval is not always
    // knowable here and both are legitimately in use. Pushing each is cheaper
    // and safer than resolving one: this list is only ever asked "does the
    // incoming code appear", so a superset can produce a false PASS but never a
    // false warning, and a false warning on a healthy renewal is the failure
    // this whole function is written to avoid.
    for (const interval of SELLABLE_INTERVALS) {
      expected.push(getTierPaystackPlanCode(input.plan, interval));
    }
    for (const envName of superseded ?? []) expected.push(readPlanCodeEnv(envName));
  } else if (superseded) {
    // A plan id that is not self-serve but still has Plans we sold it on.
    // Nothing hits this today; it is here so retiring a tier from
    // SelfServeTierId does not silently stop checking its renewals.
    for (const envName of superseded) expected.push(readPlanCodeEnv(envName));
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
 * 'enterprise' stays out: while it existed it was invoiced by hand with no
 * Paystack plan code and its expires_at was set by an admin, not by a charge
 * event. It was removed from @urganize/pricing on 2026-09-09, but any
 * pre-existing subscription row could still carry the string (the CHECK
 * constraint permits it — see the removal note in packages/pricing), so
 * keeping this exclusion is what stops such a row's renewal being read as
 * recurring.
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
 * The pricing-v2 equivalent. Null on a tier/interval with no price — which
 * should never actually happen: all three tiers `SelfServeTierId` admits (solo,
 * manager, label) carry a monthly price, and the yearly one is computed from it,
 * so a price exists for every tier and interval combination the checkout can
 * name. A null here signals a pricing-package edit that removed a price rather
 * than a caller mistake. Callers must refuse the checkout on null; sending
 * Paystack a fabricated amount is the one outcome worse than failing.
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
/**
 * The display name of a sales-led plan, or null when it is not sales-led.
 *
 * IT ASKS THE GENERATION THE REQUEST IS BEING READ IN, and that is not
 * over-engineering — it is a defect this function shipped with for a day.
 *
 * It used to do ONE lookup, against PRICING_TIERS, on the reasoning that every
 * sales-led id is also a tier id. True, and not sufficient: 'label' is a valid
 * id in BOTH generations and the two disagree about it. Since 2026-09-08 the
 * TIER Label is a ₦50,000/year self-serve plan, while the LEGACY `label` is
 * still the retired sales-led roster plan whose `PAYSTACK_PLAN_LABEL_NGN` holds
 * a mislabeled ₦750,000 Plan. A single tier-table lookup answered "not
 * sales-led" for both, which would have let a flag-off 'label' request through
 * to the legacy branch and charged ₦750,000 while recording ₦800,000 — the
 * exact bug the 2026-09-01 pass fixed, reopened from the other end.
 *
 * `salesLedIdsAreAllTierIds` in billing-plans.test.ts did NOT catch it, because
 * it pins "every sales-led legacy id is also a tier id" rather than "the tier
 * table agrees". That test is now written to pin the thing that actually
 * matters: a plan sales-led in either generation is refused in that generation.
 *
 * Returns the NAME rather than a boolean so the refusal can name the actual
 * plan — tier ids do not always match their display names (Group, removed
 * 2026-09-09, was shown for the id `enterprise`; the same could be true of a
 * future sales-led tier), and a message naming the raw id would be
 * meaningless to whoever reads it.
 */
function readSalesLedPlanName(plan: unknown, pricingV2: boolean): string | null {
  // Under v2, a tier id is read as a tier and the tier table is the authority.
  if (pricingV2 && isPricingTierId(plan)) {
    return PRICING_TIERS[plan].contactSales ? PRICING_TIERS[plan].label : null;
  }
  // Otherwise the legacy table decides for an id it knows, and the tier table
  // covers the ids it does not ('solo', 'manager', and — while it existed —
  // 'enterprise'), so a sales-led tier is still refused with the flag off
  // rather than reported as an unrecognised plan. Dead today (no tier is
  // contactSales), kept so a future sales-led tier is caught with no code
  // change here.
  if (isBillingPlanId(plan) && BILLING_PLANS[plan].contactSales) {
    return BILLING_PLANS[plan].label;
  }
  if (isPricingTierId(plan) && PRICING_TIERS[plan].contactSales) {
    return PRICING_TIERS[plan].label;
  }
  return null;
}

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

  // SALES-LED PLANS NEVER REACH CHECKOUT, whichever generation names them.
  // Answered first so the message says what to do instead of listing ids that do
  // not include this one.
  //
  // THIS USED TO TEST `plan === 'enterprise'` ALONE, and that left a live hole
  // (found 2026-09-01). Label went sales-led on 2026-08-30, and it is a valid id
  // in BOTH pricing generations. The tier branch below correctly declines it
  // (`isSelfServeTier` says no) — and it then fell through to the LEGACY branch,
  // where `isBillingPlanId` still accepts 'label'. So a request for it resolved
  // `PAYSTACK_PLAN_LABEL_NGN` (a stale ₦750,000 Plan, which exists in the
  // dashboard) while recording `BILLING_PLANS.label`'s ₦800,000: two different
  // figures, on a tier that is meant to be a conversation rather than a card
  // form.
  //
  // No UI could reach it — the wall filters on `contactSales` and `/locked`
  // early-returns on it — so this is the decision being enforced at the layer
  // that makes it, rather than only in the two surfaces that happen to respect
  // it. It also means the refusal no longer depends on an env var being unset,
  // which is what the old test was accidentally relying on.
  //
  // Derived from `contactSales` rather than listing ids, so making a tier
  // sales-led in @urganize/pricing closes its checkout in the same edit.
  const salesLedName = readSalesLedPlanName(plan, pricingV2);
  if (salesLedName) {
    return {
      ok: false,
      status: 400,
      error: `${salesLedName} is quoted per contract. Contact us rather than checking out.`,
    };
  }

  if (pricingV2 && isSelfServeTier(plan)) {
    // Both intervals are sellable again since 2026-09-10, so an interval is
    // validated for being one of ours and then honoured, rather than checked
    // against a single permitted value. The annual-only refusal that stood here
    // is gone with the restriction it enforced.
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
