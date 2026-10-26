// @urganize/pricing
//
// Shared display values for the three recurring billing plans (monthly,
// annual, label) in NGN and USD, plus formatters and copy helpers. Both
// apps/web (paywall, settings, /locked) and apps/homepage (marketing
// pricing page) import from here so the two surfaces cannot drift on what
// they advertise.
//
// What lives here:
//   - Numeric prices in BOTH the human display unit (NGN/USD) and the
//     Paystack settlement unit (kobo for NGN, cents for USD).
//   - Plan display labels + descriptions + per-tier copy.
//   - Currency formatters that match what we show in the UI.
//
// What does NOT live here (server-only, apps/web):
//   - Paystack plan codes (read from env in apps/web/lib/billing-plans.ts)
//   - PAYSTACK_SECRET_KEY / PAYSTACK_PUBLIC_KEY references
//   - Webhook reconciliation logic
//   - The subscriptions state machine
//
// The shared package is intentionally framework-agnostic — no React, no
// Node-only globals, no env reads. Safe to import from both Next App
// Router client and server components.

export type BillingPlanId = 'monthly' | 'annual' | 'label';
export type PricingCurrencyCode = 'NGN' | 'USD';

export type PlanPrice = {
  /** Currency for this entry. */
  currency: PricingCurrencyCode;
  /** Whole-unit amount (₦ for NGN, $ for USD) used for display copy. */
  amount: number;
  /** Smallest-unit amount used for Paystack transactions and webhook math.
   *  NGN: kobo. USD: cents. */
  minorUnit: number;
};

export type BillingPlanDefinition = {
  id: BillingPlanId;
  label: string;
  description: string;
  /** Interval string mirrored by Paystack subscriptions ("monthly" /
   *  "annually"). Stored on `subscriptions.plan` and reasoned about by
   *  `getPlanExpiry` server-side. */
  interval: 'monthly' | 'annually';
  /** Per-currency prices. NGN is the primary market; USD is for diaspora
   *  / international customers and gets its own Paystack plan code.
   *  For a `contactSales` tier these amounts are retained for internal
   *  reference / renewal math on any legacy subscription, but are NOT shown
   *  anywhere — the display surfaces render "Contact us" instead. */
  prices: Record<PricingCurrencyCode, PlanPrice>;
  /** When true, this tier is sales-led: no price is displayed and no
   *  self-serve checkout is offered. Both the marketing /pricing page and
   *  the in-app /locked paywall render a "Contact us" CTA (mailto
   *  SALES_CONTACT_EMAIL) in place of a price + Subscribe/Join button.
   *  Label is contactSales because it's a founder-delivered, roster-sized,
   *  price-per-deal offering (and its self-serve Paystack plans were never
   *  wired). */
  contactSales?: boolean;
};

// Where the "Contact us" CTA on a contactSales tier points. Single constant
// so the marketing page and the in-app paywall can't drift on the address.
export const SALES_CONTACT_EMAIL = 'contact@urganize.app';

// The founder's direct line, offered beside checkout on the paywall: larger
// deals close over an invoice and a walkthrough, not a card form. Lives here
// with SALES_CONTACT_EMAIL so every sales surface reads one constant.
// NOTE apps/web/lib/email-templates.ts carries its own private copy of this
// number for the welcome email; that file is deliberately dependency-free, so
// the duplication is accepted. Change both together.
export const SALES_WHATSAPP_URL = 'https://wa.me/2347067367057';

// Source of truth for the three recurring tiers. If these values change,
// both the paywall display and the marketing pricing page move together —
// no drift.
//
// Pricing rationale (repriced 2026-08-21, founder call — NGN legs only;
// supersedes the 2026-08-16 reprice described below):
//   - Monthly NGN: ₦80,000 (up from ₦3,500). Team-priced, not per-seat: one
//     price covers the whole team, matching the team-level trial and paywall
//     (NEXT_PUBLIC_FEATURE_HARD_PAYWALL) this reprice ships alongside.
//   - Annual NGN: ₦800,000 (10× monthly — the same "2 months free" ratio
//     every prior tier has held, applied to the new monthly figure).
//   - Coincidence worth knowing, not a bug: Annual NGN now equals the Label
//     tier's stored ₦800,000. No user-facing contradiction, because Label is
//     contactSales and never displays a figure. If Label is ever repriced or
//     made self-serve, separate the two so the ladder reads sensibly again.
//   - USD legs are DELIBERATELY UNTOUCHED this pass ($100/mo, $1,000/yr):
//     the founder repriced Naira only. Note the two currencies no longer
//     correspond even loosely (₦3,500 ≈ $2.30 at any realistic rate), so
//     the /locked currency toggle now shows two prices that are not the
//     same offer. This is display-only for the moment — USD checkout has
//     never worked (the Paystack account only offers NGN in plan creation,
//     so there are no PAYSTACK_PLAN_*_USD env vars and a USD start-checkout
//     500s with "plan not configured"). Reprice or hide the USD leg before
//     USD billing is ever switched on. The hard-paywall wall sidesteps this
//     by rendering NGN only (no currency toggle) — see LockedPageClient.
//   - Label: untouched — ₦800,000 / $1,250/yr, and contactSales so no
//     figure is displayed either way.
//
// OPERATIONAL STATUS (updated 2026-08-22): CLOSED for these two plans.
// New Plan objects were minted at ₦80,000 / ₦800,000 and
// PAYSTACK_PLAN_MONTHLY_NGN / PAYSTACK_PLAN_ANNUAL_NGN repointed in Vercel
// BEFORE NEXT_PUBLIC_FEATURE_HARD_PAYWALL was switched on, so checkout now
// charges what it advertises. This is the first pass in four that did not
// ship the gap (2026-07-14 shipped constants with no Plans; 2026-07-15
// closed it; 2026-08-16 reopened it; 2026-08-21 inherited it).
//
// The gap is OPEN AGAIN for the Manager tier below, which has no Plan
// object yet — see the PRICING TIERS block. Treat minting-before-flipping
// as the default order of operations on any reprice or new tier.
//
// Historical (2026-07-15 full retier, now superseded): Monthly went
// ₦17,000→₦150,000 / $26→$100 and Annual ₦170,000→₦1,500,000 / $260→$1,000,
// with new NGN Plan objects created 2026-07-20 (URG-162).
//
// Minor units (kobo / cents) are pre-computed here so callers never
// multiply by 100 at the call site — that's where unit-mismatch bugs hide.
export const BILLING_PLANS: Record<BillingPlanId, BillingPlanDefinition> = {
  monthly: {
    id: 'monthly',
    label: 'Monthly',
    description: 'Billed every month. Cancel anytime from settings.',
    interval: 'monthly',
    prices: {
      NGN: { currency: 'NGN', amount: 80_000, minorUnit: 80_000_00 },
      USD: { currency: 'USD', amount: 100, minorUnit: 100_00 },
    },
  },
  annual: {
    id: 'annual',
    label: 'Annual',
    description: 'Billed once a year. ~2 months free vs monthly.',
    interval: 'annually',
    prices: {
      NGN: { currency: 'NGN', amount: 800_000, minorUnit: 800_000_00 },
      USD: { currency: 'USD', amount: 1_000, minorUnit: 1_000_00 },
    },
  },
  label: {
    id: 'label',
    label: 'Label',
    description: 'For labels and managers running a roster. Priced per roster — talk to us.',
    interval: 'annually',
    // Retained for reference / any legacy subscription's renewal math, but
    // NOT displayed — contactSales makes both surfaces show "Contact us".
    prices: {
      NGN: { currency: 'NGN', amount: 800_000, minorUnit: 800_000_00 },
      USD: { currency: 'USD', amount: 1_250, minorUnit: 1_250_00 },
    },
    contactSales: true,
  },
};

export const BILLING_PLAN_ORDER: readonly BillingPlanId[] = ['monthly', 'annual', 'label'] as const;

export const SUPPORTED_CURRENCIES: readonly PricingCurrencyCode[] = ['NGN', 'USD'] as const;
export const DEFAULT_PRICING_CURRENCY: PricingCurrencyCode = 'NGN';

export function getPlan(id: BillingPlanId): BillingPlanDefinition {
  return BILLING_PLANS[id];
}

export function getPlanPrice(
  id: BillingPlanId,
  currency: PricingCurrencyCode
): PlanPrice {
  return BILLING_PLANS[id].prices[currency];
}

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return value === 'monthly' || value === 'annual' || value === 'label';
}

export function isPricingCurrency(value: unknown): value is PricingCurrencyCode {
  return value === 'NGN' || value === 'USD';
}

// Display formatting. Uses Intl with the natural locale for each currency:
//   - NGN: en-NG, no fractional digits (we never sell partial naira)
//   - USD: en-US, no fractional digits (whole-dollar pricing)
// If a future plan ships with sub-unit pricing, switch maximumFractionDigits
// to 2 — the function signature already supports it via the amount input.
export function formatPlanPrice(price: PlanPrice): string {
  const formatter = new Intl.NumberFormat(price.currency === 'NGN' ? 'en-NG' : 'en-US', {
    style: 'currency',
    currency: price.currency,
    maximumFractionDigits: 0,
  });
  return formatter.format(price.amount);
}

export function formatPlanCyclePrice(
  id: BillingPlanId,
  currency: PricingCurrencyCode
): string {
  const price = getPlanPrice(id, currency);
  const suffix = id === 'monthly' ? '/mo' : '/yr';
  return `${formatPlanPrice(price)}${suffix}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICING TIERS (v2) — the tier × interval matrix
// ─────────────────────────────────────────────────────────────────────────────
//
// ADDITIVE, and deliberately so. Everything above stays exactly as it is
// because the LIVE paywall reads it: /locked and TeamWall call getPlan() at
// render time and NEXT_PUBLIC_FEATURE_HARD_PAYWALL is on in production, so
// editing BILLING_PLANS would change what a real checkout advertises. The
// switch to the tiers below is gated by NEXT_PUBLIC_FEATURE_PRICING_V2 in
// apps/web; with that flag off, nothing here reaches a user.
//
// The shape change is the point. Above, "monthly" and "annual" are two
// PLANS. Here, plan and interval are two dimensions: three tiers, each
// billable monthly or annually. A tier is what you buy; an interval is how
// often you pay for it.
//
// HISTORICAL, and worth keeping because it explains the shape of the live
// data: at the pricing-v2 launch LABEL'S PRICES WERE DELIBERATELY IDENTICAL TO
// THE LIVE monthly/annual AMOUNTS (₦80,000 / ₦800,000) — monthly → label @
// monthly, annual → label @ annual, the same figures against the SAME Paystack
// Plan objects — so that no existing or in-flight subscriber changed price and
// only MANAGER needed new Plan objects minted.
//
// SUPERSEDED 2026-08-30 (founder call): Label is sales-led now and carries no
// prices at all, so the pinning test that guarded that equality is gone with
// them. Anyone already subscribed on `label` is unaffected — a renewal reads
// `subscriptions.billing_interval` plus BILLING_PLANS, never this tier's
// amounts, and `isRecurringPlan` still accepts 'label'. MANAGER is now the
// only tier with a Plan object in play.
//
// NGN only, matching the launch decision. USD is absent rather than zero:
// USD checkout has never worked (the Paystack account offers NGN only in
// plan creation), and carrying a USD figure here is how the currency toggle
// ended up advertising two prices that were not the same offer.

// 'enterprise' is Group's id. The DISPLAY NAME is "Group" and must stay so; the
// id stays `enterprise` because it is what subscriptions.plan stores and what
// subscriptions_plan_check (20260823100000) already permits, so bringing Group
// back on 2026-10-02 needed no migration. Renaming the id would mean one.
export type PricingTierId = 'solo' | 'manager' | 'label' | 'enterprise';
/** How often a plan is paid. `semiannual` (6 months, paid up front) since
 *  2026-10-22 (self-serve checkout, founder approved): 6 months are billed at
 *  SIX_MONTHS_BILLED months of the monthly price, so one is free. */
export type BillingInterval = 'monthly' | 'semiannual' | 'annual';

/** Which price list a new checkout is sold on. Stored on
 *  `subscriptions.plan_version` and `subscription_charges.plan_version`, so a
 *  subscriber's row says which prices they locked in. Bump it on every reprice;
 *  rows written before 2026-10-22 read 'legacy'. */
export const PRICE_LIST_VERSION = '2026-10-22';

export type TierPrice = {
  /** Whole naira, for display copy. */
  amount: number;
  /** Kobo, for Paystack transactions and webhook math. */
  minorUnit: number;
};

/** Months billed on the yearly plan, so two of the twelve are free.
 *
 *  MONTHLY IS THE PRICE WE SET; YEARLY IS ARITHMETIC (founder call,
 *  2026-09-10). A tier declares `monthlyPrice` and nothing else — the yearly
 *  figure is this many months of it, computed in `getTierPrice`. Repricing is
 *  one number per tier, the ratio holds by construction rather than by anyone
 *  keeping two literals in step, and the "2 months free" badge comes out of the
 *  same constant as the gap it describes (see annualSavingCopy).
 *
 *  !! CHANGING THIS MOVES EVERY YEARLY PRICE AT ONCE, including tiers whose
 *  yearly Paystack Plan is already minted — the advertise-versus-charge gap
 *  this repo has shipped five times. `entitlements.test.ts` pins what the
 *  arithmetic resolves to for exactly that reason: if it fails, mint the Plans
 *  before shipping the number. */
export const ANNUAL_MONTHS_BILLED = 10;

/** Months billed for the 6-month prepay, so one of the six is free
 *  ("6-for-5", founder approved 2026-10-22). Same rule as ANNUAL_MONTHS_BILLED:
 *  changing it moves every 6-month price at once, Plans included. */
export const SIX_MONTHS_BILLED = 5;

/** Months each interval covers and months it charges for. The only place the
 *  multiplication happens, so no caller can scale or round it differently. */
export const INTERVAL_MONTHS: Record<BillingInterval, { covers: number; billed: number }> = {
  monthly: { covers: 1, billed: 1 },
  semiannual: { covers: 6, billed: SIX_MONTHS_BILLED },
  annual: { covers: 12, billed: ANNUAL_MONTHS_BILLED },
};

function intervalAmount(monthlyAmount: number, interval: BillingInterval): number {
  return monthlyAmount * INTERVAL_MONTHS[interval].billed;
}

/** Builds a TierPrice from a whole-naira amount, deriving the kobo figure so no
 *  tier carries a hand-typed minor unit — that is where unit-mismatch bugs
 *  hide, and it is why this package pre-computes them at all. */
function tierPrice(amount: number): TierPrice {
  return { amount, minorUnit: amount * 100 };
}

/** A countable ceiling on a tier. `null` means no ceiling.
 *
 * These live HERE rather than only in apps/web's entitlement map because the
 * marketing site renders them and cannot import from the product app
 * (apps/homepage depends on @urganize/pricing, not on apps/web). One number,
 * read by the page that advertises it AND by the route that enforces it, is the
 * only arrangement where a published limit cannot drift from a real one — which
 * is the failure this repo has shipped repeatedly with prices.
 *
 * The BOOLEAN entitlements (data export, concierge onboarding, support channel,
 * SSO) stay in apps/web: they gate behaviour rather than being numbers a page
 * quotes, and the resolution logic around them has to stay where vitest
 * collects it. */
export type TierLimits = {
  /** Artists on the roster.
   *
   *  DECLARED, NOT YET ENFORCED, and the honest reason is that the product has
   *  no way to add a second artist: a workspace resolves ONE artist row
   *  (`getWorkspaceArtist`), the create-release modal collects no artist input,
   *  and the one-artist limit is a UI fact rather than a schema one. So Solo's
   *  ceiling of 1 is what every account already gets, and the higher numbers
   *  describe the offer this ladder is sold on rather than a switch anyone can
   *  flip today. It lives here anyway, with the enforced ceilings, so the page
   *  quotes the same field a future check will read — a literal in the card copy
   *  is how a published number drifts from a real one. */
  artists: number | null;
  /** Active team members. */
  seats: number | null;
  /** Releases still being worked — not archived, not released. */
  activeReleases: number | null;
  /** UrgAns actions per billing period. Declared for entitlements; read by no
   *  check and NOT shown on the pricing page, because UrgAns is metered in
   *  credits (see urgansMonthlyCredits). The page quoted this as "40 / 150
   *  UrgAns actions a month" until 2026-10-15, which matched nothing the app
   *  charges. */
  urgansMonthlyActions: number | null;
};

export type PricingTierDefinition = {
  id: PricingTierId;
  label: string;
  /** One line on who this is for — the pricing card's subtitle. */
  audience: string;
  /** UrgAns credits the plan gives each billing window, as the pricing card
   *  prints them. apps/web/lib/credits/allowance.test.ts holds this equal to
   *  ALLOWANCE_CREDITS, so the published number is the granted one. Group's is its default; the
   *  founder tops it up per deal. */
  urgansMonthlyCredits: number;
  /** The tier's NGN price PER MONTH — the only price a tier declares.
   *
   *  THE SHAPE IS STILL THE ENFORCEMENT, pointed the other way. From 2026-09-08
   *  this field was `{ annual: TierPrice }` and the acceptance bar was "nowhere
   *  a monthly figure"; on 2026-09-10 the founder reversed that — monthly is
   *  what we charge and yearly is ten months of it. So there is no stored yearly
   *  figure at all: `getTierPrice(id, 'annual')` computes it, and no surface can
   *  render a yearly price that disagrees with the monthly one, because there is
   *  only one number to disagree with.
   *
   *  BOTH INTERVALS ARE ON SALE AGAIN. `SELLABLE_INTERVALS` is the list, and
   *  `DEFAULT_SELLING_INTERVAL` is what a surface opens on.
   *
   *  Absent entirely on a sales-led tier, so a caller cannot accidentally render
   *  a price we never quoted — `getTierPrice` answers null for BOTH intervals
   *  and the caller is forced into the "Let's talk" branch. */
  monthlyPrice?: TierPrice;
  /** The countable ceilings. See TierLimits for why they live here. */
  limits: TierLimits;
  /** The non-countable things this tier includes, in customer words.
   *
   *  Written out rather than derived, because these are claims about the
   *  product and each one has to be true today. Nothing here may name an
   *  unbuilt feature: `sso` and `sub_teams` are declared in the entitlement map
   *  and read by nothing, so no tier's list may claim either — a contract can
   *  promise them, a public page cannot. (This is the rule that used to be
   *  stated against Group's list specifically; Group is gone as of 2026-09-09,
   *  see the removal note below, but the rule still binds every remaining
   *  tier.) */
  perks: readonly string[];
  /** Sales-led: no price displayed, no self-serve checkout. Both surfaces
   *  render a "Let's talk" CTA to SALES_CONTACT_EMAIL instead.
   *
   *  NO TIER SETS THIS as of 2026-09-09 (Group was the only one and it was
   *  removed — see the note where PRICING_TIER_ORDER used to list it). The
   *  field stays: it is generic infrastructure (readSalesLedPlanName,
   *  quotePlanChange, the wall's WALL_TIERS filter all key off it), not
   *  something specific to the tier that used to use it, so a future sales-led
   *  tier needs no new plumbing — just this flag. */
  contactSales?: boolean;
  /** ⚠️ READ ONLY BY THE IN-APP WALL NOW. The marketing site ignores this
   *  flag entirely: the "Most teams" badge came off both surfaces on
   *  2026-09-11, and the card elevation and CTA emphasis it was still doing
   *  came off the same day (founder call, "remove the highlight so all the
   *  pricing tabs look uniform"). So /pricing and the homepage strip render
   *  three identical cards, and changing this value moves nothing there.
   *
   *  Its one live consumer is apps/web's TierPlanPicker, which renders the
   *  badge on the upgrade wall — deliberately a separate surface and a
   *  separate call. Exactly one tier may set this, and entitlements.test.ts
   *  pins which one, so this stays in the data rather than being deleted.
   *
   *  ON MANAGER since 2026-10-17 (founder-approved reprice), moved back from
   *  Solo now that Manager is the plan we recommend. Before that it was
   *  ON SOLO from 2026-09-09 (founder call), moved from Manager. It was on
   *  Manager because Manager used to be the cheapest self-serve tier and the
   *  one to point a visitor at; Solo has been the entry tier since 2026-08-30,
   *  so the marker now sits on the tier it was always meant to describe —
   *  "most teams choose this" reads correctly on the cheapest option again. */
  recommended?: boolean;
  /** Whether the plan includes distribution through our partner (TRM Distro).
   *  Since 2026-10-22 Urganize pays TRM a fixed fee per entitled team, so the
   *  plan price covers it. Solo never includes it. Whether a monthly
   *  subscriber gets it also depends on DISTRIBUTION_REQUIRES_PREPAY, which
   *  `distributionIncluded` takes as an argument. */
  includesDistribution: boolean;
};

export const PRICING_TIERS: Record<PricingTierId, PricingTierDefinition> = {
  // The entry tier (added 2026-08-30, founder call). Manager used to sit here
  // and read "one or two artists"; Solo takes the one-artist half of that so the
  // ladder starts at a price a single manager can say yes to on their own, and
  // Manager becomes the step up rather than the front door.
  //
  // ⚠️ STALE BELOW, corrected 2026-10-17: Solo HAS been purchasable since
  // 2026-09-01 — it is in `SelfServeTierId`, `subscriptions_plan_check` permits
  // 'solo', and PAYSTACK_PLAN_SOLO_PER_MONTH_NGN / _PER_YEAR_NGN are set in
  // Production (repointed to the ₦7,500 / ₦75,000 Plans on 2026-10-17). The
  // paragraph that follows describes the 2026-08-30 staging only.
  //
  // NOT PURCHASABLE YET, and that is deliberate rather than an oversight — the
  // same staging Manager itself shipped in. `solo` is absent from
  // `SelfServeTierId` in apps/web, has no Paystack Plan object, and is not in
  // `subscriptions_plan_check`, so nothing can write it to a subscription row
  // and no team can resolve onto it. Its CTA is the free team trial, which
  // needs no plan code. Making it buyable is a migration plus two minted Plans
  // plus their env vars — see the note in apps/web/lib/billing-plans.ts.
  solo: {
    id: 'solo',
    label: 'Solo',
    // "For an artist and their manager." since 2026-10-17 (founder-approved
    // reprice, strategy doc section 8), when Solo went to two seats. It read
    // "For an independent artist." from 2026-10-02 while Solo was one seat.
    audience: 'For an artist and their manager.',
    // ₦5,000 since 2026-10-23 (founder approved ~02:00 WAT; no paying Solo
    // customer, so no grandfathering). The _PER_MONTH_ / _PER_6_MONTHS_ /
    // _PER_YEAR_ vars point at the ₦5,000 / ₦25,000 / ₦50,000 Plans (monthly
    // and yearly reused from September, 6-month minted that day). Solo
    // retention bands become ₦2,500 / ₦3,500 / ₦4,500, so the old _5500 /
    // _7500 retention Plans are no longer read.
    // ₦8,000 from 2026-10-22 (founder, self-serve checkout; Plans at
    // ₦8,000 / ₦40,000 / ₦80,000, left in Paystack untouched).
    // ₦7,500 from 2026-10-17 (founder approved the reprice that day; it was
    // ₦5,000 from 2026-09-10). Monthly only — the yearly price is ten months of
    // this, see monthlyPrice. New Paystack Plans were minted at ₦7,500 /
    // ₦75,000 and the _PER_MONTH_ / _PER_YEAR_ vars repointed before this
    // shipped; the ₦5,000 Plans stay in Paystack untouched.
    monthlyPrice: tierPrice(5_000),
    includesDistribution: false,
    urgansMonthlyCredits: 150,
    // TWO seats since 2026-10-17 (founder-approved reprice: "artist +
    // manager"). The owner holds one, so a Solo account can invite one person.
    // It was 1 from 2026-10-02 and 2 from 2026-08-30 before that. Raising it
    // removes nobody and refuses nobody who was allowed before.
    limits: { artists: 1, seats: 2, activeReleases: 1, urgansMonthlyActions: 40 },
    perks: [],
    // `recommended` moved to Manager on 2026-10-17 (founder-approved reprice).
    // It sat here from 2026-09-09.
  },
  manager: {
    id: 'manager',
    label: 'Manager',
    audience: 'For a manager running more than one artist.',
    // ₦30,000 since 2026-10-22 (founder, no Manager customer had paid yet, so
    // no grandfathering; Plans at ₦30,000 / ₦150,000 / ₦300,000).
    // ₦25,000 from 2026-10-17 (founder approved the reprice that day; it was
    // ₦35,000 earlier the same day and ₦22,000 before that). Monthly only — the
    // yearly price is ten months of this. New ₦25,000 / ₦250,000 Paystack Plans
    // were minted and the vars repointed before this shipped.
    monthlyPrice: tierPrice(30_000),
    includesDistribution: true,
    urgansMonthlyCredits: 660,
    // 3 artists / 5 seats since 2026-10-17 (was 5 artists / 4 seats). Both are
    // enforced (the artist ceiling since rosters shipped, 2026-08-30). Lowering
    // artists removes nobody: a team already over 3 keeps its artists and is
    // only refused a new one.
    limits: { artists: 3, seats: 5, activeReleases: 3, urgansMonthlyActions: 150 },
    perks: [],
    // THE RECOMMENDED PLAN since 2026-10-17 (founder-approved reprice). Manager
    // is the plan the product is built for — a manager running a roster — and
    // at ₦25,000 it is the one to point a visitor at. It sat on Solo from
    // 2026-09-09. Read only by the in-app TierPlanPicker; see `recommended`.
    recommended: true,
  },
  // SELF-SERVE AGAIN SINCE 2026-09-08 (founder call), at ₦50,000/year. This
  // REVERSES the 2026-08-30 decision that made Label sales-led with no price at
  // all, and the reversal was confirmed before it was built rather than inferred
  // from the reprice: the annual-only spec's own acceptance line is "three
  // annual prices and one 'Let's talk' card", which only adds up if Label
  // carries a price and a card checkout and Group is the lone conversation.
  //
  // WHAT THIS CHANGES FOR AN EXISTING LABEL SUBSCRIBER, because it is more than
  // a number: `isContactSalesPlan('label')` answers false again, so a lapsed
  // Label subscriber is pointed at checkout rather than a mailto, and
  // `plan-change.ts` no longer refuses a move to or from Label as sales-led.
  // Neither is a problem, because the grandfathered-rate guard in that module
  // now refuses any self-serve change for an account paying something other
  // than today's list price — and every pre-2026-09-08 Label subscriber is
  // exactly that. See `isGrandfatheredRate`.
  //
  // Its Paystack Plan is its OWN, and must be. Label's tier prices used to be
  // byte-identical to the legacy monthly/annual plans, which is why
  // TIER_PLAN_CODE_ENV_VAR pointed it at those shared Plan objects. At ₦50,000
  // that is no longer true, so reusing them would bill a new Label customer
  // ₦800,000. See the env var block in apps/web/lib/billing-plans.ts.
  //
  // `label` MUST keep unlimited limits: `resolveTeamTier` fails open to this
  // tier for a walled, legacy or unrecognised plan, so capping it here would
  // silently cap teams the resolver could not identify.
  label: {
    id: 'label',
    label: 'Label',
    // "For small labels and management teams." since 2026-10-02, the strategy
    // doc's wording for this tier ("Labels and management companies") in the
    // site's plain voice. It read "For a label or a team running a roster."
    // until 2026-09-11, then "For a team running a roster." while labels were
    // out of the audience.
    audience: 'For small labels and management teams.',
    // ₦100,000 since 2026-10-26 (founder, with the call-led onboarding rules;
    // Paystack Plans at
    // ₦100,000 / ₦500,000 / ₦1,000,000 are still to be minted.
    // ₦60,000 from 2026-10-17 (founder approved the reprice that day; it was
    // ₦50,000 from 2026-09-10). Monthly only — the yearly price is ten months
    // of this. New ₦60,000 / ₦600,000 Paystack Plans were minted and the vars
    // repointed before this shipped.
    monthlyPrice: tierPrice(100_000),
    includesDistribution: true,
    urgansMonthlyCredits: 1500,
    limits: { artists: null, seats: null, activeReleases: null, urgansMonthlyActions: null },
    perks: [
      'Everything in Manager',
      'We set your roster up with you',
      'WhatsApp support, answered same day',
    ],
  },
  // GROUP, BACK SINCE 2026-10-02 (strategy doc, section 8: "Group | Custom |
  // Custom | Custom | Distributors and multi-label groups"). It was removed
  // 2026-09-09; the doc made it a plan again, and Group teams count as paying
  // teams on the scoreboard.
  //
  // SALES-LED: no monthlyPrice, so getTierPrice answers null for both intervals
  // and every surface renders the "Let's talk" CTA. There is no Paystack Plan and
  // no self-serve checkout; the founder agrees a price and records it in
  // /admin/teams with "Mark paid" on the Group plan, which writes
  // subscriptions.plan = 'enterprise' with the agreed amount, term and interval.
  //
  // Unlimited, like Label. A Group deal is the largest account we sell, so no
  // ceiling may bite it. Its monthly credits are Label's 1,500 by default
  // (founder call, 2026-10-02) and topped up by hand per deal.
  //
  // Perks name only what is built today, the rule above. No SSO, no sub-teams:
  // both are declared in the entitlement map and read by nothing.
  enterprise: {
    id: 'enterprise',
    label: 'Group',
    includesDistribution: true,
    audience: 'For distributors and multi-label groups.',
    urgansMonthlyCredits: 1500,
    limits: { artists: null, seats: null, activeReleases: null, urgansMonthlyActions: null },
    perks: [
      'Everything in Label',
      'A price agreed with you',
      'Pay by invoice or bank transfer',
      'We set every label up with you',
    ],
    contactSales: true,
  },
};

/** Card order on the pricing page: cheapest first, then the conversation.
 *  Solo leads and Manager sits one step above it, so the jump the ladder is
 *  built around (one artist to a roster) is the first thing a visitor reads.
 *
 *  FOUR cards since 2026-10-02: Solo, Manager and Label are self-serve, and
 *  Group is the lone "Let's talk" card. It was three from 2026-09-09, when Group
 *  was removed; the strategy doc made it a plan again. */
export const PRICING_TIER_ORDER: readonly PricingTierId[] = [
  'solo',
  'manager',
  'label',
  'enterprise',
] as const;

/** The intervals a new purchase may choose, and the one a surface opens on.
 *
 *  BOTH ARE ON SALE AGAIN since 2026-09-10 (founder call), reversing the
 *  2026-09-08 collapse to annual-only. That collapse exported a single
 *  `SELLING_INTERVAL`, which is deliberately GONE rather than repointed: it read
 *  as "the one interval", so leaving the name in place while two intervals sell
 *  would be the half-added state its own comment warned about. A caller that
 *  used to reach for it now has to say which of the two it means, and the
 *  compiler makes it.
 *
 *  STILL EXPORTED SO NOTHING WRITES THE LITERAL. Checkout, the wall and the
 *  status route all need to name an interval, and each of them spelling
 *  `'monthly'` by hand is how the two surfaces drift apart.
 *
 *  Monthly is the default because it is the price we set and the smaller
 *  number; the yearly option is the upsell beside it, carrying
 *  `annualSavingCopy`. */
export const SELLABLE_INTERVALS: readonly BillingInterval[] = ['monthly', 'semiannual', 'annual'] as const;
export const DEFAULT_SELLING_INTERVAL: BillingInterval = 'monthly';

export function isSellableInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'semiannual' || value === 'annual';
}

/** "1 month free" / "2 months free" for a prepaid interval, null for monthly
 *  or a sales-led tier. Derived from INTERVAL_MONTHS so the badge and the price
 *  are one fact. */
export function intervalSavingCopy(id: PricingTierId, interval: BillingInterval): string | null {
  if (!PRICING_TIERS[id].monthlyPrice) return null;
  const { covers, billed } = INTERVAL_MONTHS[interval];
  const free = covers - billed;
  if (free <= 0) return null;
  return `${free} ${free === 1 ? 'month' : 'months'} free`;
}

/** Naira saved on a prepaid interval against paying monthly for the same
 *  months. 0 for monthly; null for a sales-led tier. */
export function intervalSavingNaira(id: PricingTierId, interval: BillingInterval): number | null {
  const monthly = PRICING_TIERS[id].monthlyPrice;
  if (!monthly) return null;
  const { covers, billed } = INTERVAL_MONTHS[interval];
  return monthly.amount * (covers - billed);
}

/** An amount for one interval spread per month, in kobo (MRR math). */
export function monthlyEquivalentKobo(amountKobo: number, interval: BillingInterval): number {
  return Math.round(amountKobo / INTERVAL_MONTHS[interval].covers);
}

/** Does a team on this tier and interval get "Distribution included"?
 *
 *  Solo never. Manager, Label and Group do, except that with
 *  DISTRIBUTION_REQUIRES_PREPAY on (passed in, because this package reads no
 *  env) a monthly subscriber does not: TRM may bill a year upfront, and a
 *  team that leaves after one month would cost more than it paid. */
export function distributionIncluded(
  id: PricingTierId,
  interval: BillingInterval | null,
  requiresPrepay: boolean
): boolean {
  if (!PRICING_TIERS[id].includesDistribution) return false;
  if (requiresPrepay && interval === 'monthly') return false;
  return true;
}

/** The interval's name as a customer reads it: "Monthly", "6 months", "Yearly". */
export function intervalLabel(interval: BillingInterval): string {
  return interval === 'monthly' ? 'Monthly' : interval === 'semiannual' ? '6 months' : 'Yearly';
}

/** The yearly saving, phrased the one way the copy rules allow.
 *
 *  Never a percentage: "2 months free" is what a manager can check against
 *  their own bank statement, and a percentage invites an argument about how it
 *  was calculated. Derived from ANNUAL_MONTHS_BILLED — the same constant
 *  `getTierPrice` uses to compute the yearly amount — so this line and the
 *  saving it describes are one fact stated twice, and repricing cannot leave
 *  either stale. Null for a sales-led tier, which has no monthly price and so
 *  no yearly one to save against. */
export function annualSavingCopy(id: PricingTierId): string | null {
  if (!PRICING_TIERS[id].monthlyPrice) return null;
  return `${12 - ANNUAL_MONTHS_BILLED} months free`;
}

/** One customer-facing line per countable ceiling, plus the tier's perks.
 *
 *  THE NUMBERS ARE NEVER WRITTEN INTO A STRING — they come out of `limits`, the
 *  same field apps/web enforces against. So a re-cut tier updates the pricing
 *  page and the enforcement together, and the page physically cannot advertise
 *  a ceiling the product does not apply. That is the whole reason `limits` sits
 *  in this package rather than only in the app.
 *
 *  Plural handling is explicit rather than a naive `+ 's'`: "1 people" on a
 *  future one-seat tier would be the kind of small wrongness that makes a
 *  pricing page feel unfinished. */
/** The distribution line on a pricing card.
 *
 *  REVERSED 2026-10-22 (founder): until then every tier said "Distribution
 *  through our partner", because teams paid the partner themselves. Urganize
 *  now pays TRM a fixed fee per entitled team, so Manager, Label and Group
 *  really do include distribution and the card says so. Solo does not, and its
 *  card says nothing about it. With DISTRIBUTION_REQUIRES_PREPAY on, the
 *  monthly view of an entitled tier says it needs a 6-month or yearly plan. */
export function distributionHighlight(
  id: PricingTierId,
  interval: BillingInterval,
  requiresPrepay: boolean
): string | null {
  if (!PRICING_TIERS[id].includesDistribution) return null;
  if (distributionIncluded(id, interval, requiresPrepay)) return 'Distribution included';
  return 'Distribution on 6-month and yearly plans';
}

export function tierHighlights(
  id: PricingTierId,
  opts: { interval?: BillingInterval; distributionRequiresPrepay?: boolean } = {}
): string[] {
  const { limits, perks, urgansMonthlyCredits, contactSales } = PRICING_TIERS[id];
  const lines: string[] = [];

  // Roster size leads, because it is the question a manager answers about
  // themselves before any other number on the card means anything.
  //
  // "1 artist" is exact and "Up to 5 artists" is a ceiling you grow into, which
  // is why the two are phrased differently rather than normalised: the entry
  // tier states what you get, the tier above states how far you can go.
  lines.push(
    limits.artists === null
      ? 'Unlimited artists'
      : limits.artists === 1
        ? '1 artist'
        : `Up to ${limits.artists} artists`
  );
  lines.push(
    limits.seats === null
      ? 'Unlimited team members'
      : `${limits.seats} ${limits.seats === 1 ? 'person' : 'people'} on your team`
  );
  lines.push(
    limits.activeReleases === null
      ? 'Unlimited rollouts at a time'
      : `${limits.activeReleases} ${limits.activeReleases === 1 ? 'rollout' : 'rollouts'} at a time`
  );
  // Credits, the unit the app actually meters (lib/credits/allowance.ts reads
  // the same field). Group's amount is agreed per deal, so it names no number.
  lines.push(
    contactSales
      ? 'UrgAns credits to fit your deal'
      : `${urgansMonthlyCredits.toLocaleString('en-US')} UrgAns credits a month`
  );

  const distribution = distributionHighlight(
    id,
    opts.interval ?? DEFAULT_SELLING_INTERVAL,
    opts.distributionRequiresPrepay ?? false
  );
  return [...lines, ...(distribution ? [distribution] : []), ...perks];
}

export function getTier(id: PricingTierId): PricingTierDefinition {
  return PRICING_TIERS[id];
}

export function isPricingTierId(value: unknown): value is PricingTierId {
  return (
    value === 'solo' ||
    value === 'manager' ||
    value === 'label'
  );
}

/** Onboarding rules (founder, 2026-10-26). Only Solo and Manager on the monthly
 *  plan are paid for without a call. Label, and every 6-month or yearly plan,
 *  start with an onboarding call, and the founder sends the payment link
 *  afterwards. One definition, read by the pricing page, the wall, the checkout
 *  page and the payment routes. */
export function isSelfServePurchase(tier: PricingTierId, interval: BillingInterval): boolean {
  return (tier === 'solo' || tier === 'manager') && interval === 'monthly';
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'semiannual' || value === 'annual';
}

/** A tier's price for one interval. Null for a sales-led tier — callers must
 *  render "Let's talk" or refuse, never ₦0.
 *
 *  MONTHLY IS READ, YEARLY IS COMPUTED. Only the monthly figure is stored, so
 *  every yearly price the product displays and every yearly amount it charges
 *  comes out of the one multiplication here. There is nowhere else a yearly
 *  figure can enter the system, which is the point of the shape. */
export function getTierPrice(
  id: PricingTierId,
  interval: BillingInterval
): TierPrice | null {
  const monthly = PRICING_TIERS[id].monthlyPrice;
  if (!monthly) return null;
  return interval === 'monthly' ? monthly : tierPrice(intervalAmount(monthly.amount, interval));
}

/** A tier's price as a customer reads it: "₦7,500/month", "₦75,000/year". Null
 *  for a sales-led tier, which must render "Let's talk" instead.
 *
 *  THE INTERVAL ARGUMENT CAME BACK on 2026-09-10, when both intervals went on
 *  sale again. It was deliberately absent while only one was, so that no display
 *  surface could print the wrong kind of figure; with two on sale the guarantee
 *  has to move from the signature to the caller, which now passes whatever its
 *  own toggle is showing. It defaults to DEFAULT_SELLING_INTERVAL so a surface
 *  with no toggle still reads correctly rather than having to pick.
 *
 *  "/month" and "/year" spelled out rather than "/mo" and "/yr", per the
 *  founder's copy rules: the page has to read at a fifth-grade level and an
 *  abbreviation is one more thing to decode. */
export function formatTierPrice(
  id: PricingTierId,
  interval: BillingInterval = DEFAULT_SELLING_INTERVAL
): string | null {
  const price = getTierPrice(id, interval);
  if (!price) return null;
  const formatted = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(price.amount);
  return interval === 'semiannual'
    ? `${formatted} for 6 months`
    : `${formatted}/${interval === 'monthly' ? 'month' : 'year'}`;
}
