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

export type PricingTierId = 'solo' | 'manager' | 'label' | 'enterprise';
export type BillingInterval = 'monthly' | 'annual';

export type TierPrice = {
  /** Whole naira, for display copy. */
  amount: number;
  /** Kobo, for Paystack transactions and webhook math. */
  minorUnit: number;
};

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
  /** UrgAns actions per billing period. */
  urgansMonthlyActions: number | null;
};

export type PricingTierDefinition = {
  id: PricingTierId;
  label: string;
  /** One line on who this is for — the pricing card's subtitle. */
  audience: string;
  /** The NGN price. ANNUAL ONLY since 2026-09-08 (founder call): every tier is
   *  billed once a year and there is no monthly option anywhere.
   *
   *  THE SHAPE IS THE ENFORCEMENT. This is not `Record<BillingInterval, …>`
   *  with the monthly key left empty — there is no monthly figure in the data
   *  at all, so no surface can render one by reaching for the wrong key, and
   *  `getTierPrice` answers null for any interval but annual. The acceptance
   *  bar for that reprice was "nowhere a monthly figure", and a type is a
   *  better guarantee of that than a sweep of the call sites.
   *
   *  `BillingInterval` still carries 'monthly' and must keep doing so: real
   *  rows in `subscriptions.billing_interval` hold it, and those subscriptions
   *  still renew on a monthly cycle. What ended is SELLING one, not honouring
   *  the ones already sold.
   *
   *  Absent entirely on a sales-led tier, so a caller cannot accidentally
   *  render a price we never quoted. */
  prices?: { annual: TierPrice };
  /** The countable ceilings. See TierLimits for why they live here. */
  limits: TierLimits;
  /** The non-countable things this tier includes, in customer words.
   *
   *  Written out rather than derived, because these are claims about the
   *  product and each one has to be true today. Nothing here may name an
   *  unbuilt feature: `sso` and `sub_teams` are declared in the entitlement map
   *  and read by nothing, so they are deliberately ABSENT from Group's
   *  list (founder call, 2026-08-24) — a contract can promise them, a public
   *  page cannot. */
  perks: readonly string[];
  /** Sales-led: no price displayed, no self-serve checkout. Both surfaces
   *  render a "Let's talk" CTA to SALES_CONTACT_EMAIL instead. */
  contactSales?: boolean;
  /** Visually elevated on the pricing page and carries the "Most teams
   *  choose this" marker. Exactly one tier may set this. */
  recommended?: boolean;
};

export const PRICING_TIERS: Record<PricingTierId, PricingTierDefinition> = {
  // The entry tier (added 2026-08-30, founder call). Manager used to sit here
  // and read "one or two artists"; Solo takes the one-artist half of that so the
  // ladder starts at a price a single manager can say yes to on their own, and
  // Manager becomes the step up rather than the front door.
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
    audience: 'For a manager running one artist.',
    prices: {
      annual: { amount: 5_000, minorUnit: 5_000_00 },
    },
    limits: { artists: 1, seats: 2, activeReleases: 1, urgansMonthlyActions: 40 },
    perks: [
      'Files and credits on every release, and a press kit for every artist',
      'Export everything you put in, any time',
      'Email support',
    ],
  },
  manager: {
    id: 'manager',
    label: 'Manager',
    audience: 'For a manager running two or more artists.',
    prices: {
      annual: { amount: 22_000, minorUnit: 22_000_00 },
    },
    limits: { artists: 5, seats: 4, activeReleases: 3, urgansMonthlyActions: 150 },
    perks: [
      'A full rollout plan, written by real managers',
      'Files and credits on every release, and a press kit for every artist',
      'Export everything you put in, any time',
      'Email support',
    ],
    // Moved here from Label 2026-08-30 (founder call), in the same pass that
    // made Label sales-led. It is now the only self-serve tier a visitor can
    // actually buy, so it is also the one to point at.
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
    audience: 'For a label or a team running a roster.',
    prices: {
      annual: { amount: 50_000, minorUnit: 50_000_00 },
    },
    limits: { artists: null, seats: null, activeReleases: null, urgansMonthlyActions: null },
    perks: [
      'Everything in Manager',
      'Save your own rollout templates',
      'We set your roster up with you',
      'WhatsApp support, answered same day',
    ],
  },
  // BACK ON THE PAGE 2026-09-08 (founder call), in the same pass that gave
  // Label a price. Group is the one sales-led card now — the annual-only spec
  // asks for "three annual prices and one 'Let's talk' card", and this is that
  // card. It had been off both surfaces since 2026-08-30, when Label took the
  // sales-led slot; Label handing that slot back is what makes room for it.
  //
  // The DEFINITION never went away, which is why this is one line in
  // PRICING_TIER_ORDER rather than a rebuild. `enterprise` is allowed by
  // subscriptions_plan_check and may already sit on a row, and ENTITLEMENTS
  // keys off every PricingTierId — so deleting it would need a migration and
  // would leave a stored row unresolvable, for no gain. This is exactly how
  // the legacy BILLING_PLANS.label entry is handled: kept so the data still
  // resolves, never rendered. Re-displaying it is one line in
  // PRICING_TIER_ORDER.
  //
  // DISPLAY NAME vs ID: this tier is called "Group" everywhere a customer can
  // read it, and its id stays `enterprise`. Renamed 2026-08-24 (founder call)
  // — "Enterprise" is B2B software jargon that means nothing to a label head,
  // and the audience line below is the accurate name: a distributor is not a
  // label, and a group operating several labels is not "a label" either.
  //
  // DO NOT rename the id to match. It is written into subscriptions.plan by
  // the checkout/admin paths and allowed by subscriptions_plan_check
  // (20260823100000_pricing_tiers.sql), so changing it needs a migration AND a
  // backfill, and would silently re-grade any stored row. The `label` id in
  // particular already carries two historical meanings (see the legacy
  // BILLING_PLANS.label above) — do not add a third collision here.
  enterprise: {
    id: 'enterprise',
    label: 'Group',
    audience: 'For distributors and groups operating several labels.',
    // No prices at all: a Group deal is quoted per contract and invoiced by
    // hand. There is no Paystack plan code for it.
    limits: { artists: null, seats: null, activeReleases: null, urgansMonthlyActions: null },
    // Only what is built. `sso` and `sub_teams` are declared in the entitlement
    // map and read by NOTHING, so they are deliberately not listed here — see
    // the note on `perks`.
    perks: [
      'Everything in Label',
      'A support commitment written into your contract',
      'Priority on UrgAns, so answers come back first',
      'Onboarding run by the founders',
    ],
    contactSales: true,
  },
};

/** Card order on the pricing page: cheapest first, then the conversation.
 *  Solo leads and Manager sits one step above it, so the jump the ladder is
 *  built around (one artist to a roster) is the first thing a visitor reads.
 *
 *  FOUR cards since 2026-09-08 (founder call): three prices, then Group. Both
 *  ends of that moved in the same pass — Label came back from sales-led with a
 *  price, and Group came back onto the page to be the single "Let's talk". */
export const PRICING_TIER_ORDER: readonly PricingTierId[] = [
  'solo',
  'manager',
  'label',
  'enterprise',
] as const;

/** The one interval anything is sold on, since 2026-09-08 (founder call).
 *
 *  EXPORTED SO NOTHING HAS TO WRITE THE LITERAL. Checkout, the wall and the
 *  status route all need to say "annual" and every one of them writing `'annual'`
 *  by hand is how a future second interval gets half-added. `BillingInterval`
 *  keeps both members because existing subscriptions still bill monthly and
 *  still renew; this constant is about what is on SALE, which is a different
 *  question and the one every new purchase asks. */
export const SELLING_INTERVAL: BillingInterval = 'annual';

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
/** Lines every tier carries, appended after the ceilings and before the tier's
 *  own perks.
 *
 *  ONE ARRAY RATHER THAN FOUR COPIES, so "on all tiers" is a fact of the code.
 *  Four pasted strings drift the moment one card is edited, and this repo has
 *  the receipts on that.
 *
 *  ⚠️ "Distribution included" IS A FOUNDER OVERRIDE, NOT DRIFT, and the doc on
 *  `perks` above forbids exactly this — nothing there may name an unbuilt
 *  feature. Urganize does not distribute music: it has no DSP integration, and
 *  third-party music platform integrations are on the v1 out-of-scope list. The
 *  real thing behind the word is the Metadata scene, which assembles the ISRC,
 *  UPC, splits and credits a distributor asks for so the handoff is one paste
 *  rather than a week of chasing. Honest wording for that was offered and the
 *  founder chose this line as written (2026-09-08). Recorded here so the next
 *  reader treats it as a decision to take back to him rather than a mistake to
 *  quietly correct. */
const UNIVERSAL_HIGHLIGHTS: readonly string[] = ['Distribution included'] as const;

export function tierHighlights(id: PricingTierId): string[] {
  const { limits, perks } = PRICING_TIERS[id];
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
      ? 'Unlimited releases at a time'
      : `${limits.activeReleases} ${limits.activeReleases === 1 ? 'release' : 'releases'} at a time`
  );
  lines.push(
    limits.urgansMonthlyActions === null
      ? 'Unlimited UrgAns'
      : `${limits.urgansMonthlyActions} UrgAns actions a month`
  );

  return [...lines, ...UNIVERSAL_HIGHLIGHTS, ...perks];
}

export function getTier(id: PricingTierId): PricingTierDefinition {
  return PRICING_TIERS[id];
}

export function isPricingTierId(value: unknown): value is PricingTierId {
  return (
    value === 'solo' ||
    value === 'manager' ||
    value === 'label' ||
    value === 'enterprise'
  );
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'annual';
}

/** Null for a sales-led tier, and null for any interval but the one we sell —
 *  callers must render "Let's talk" or refuse, never ₦0.
 *
 *  IT STILL TAKES AN INTERVAL even though only one is on sale, because the
 *  callers that reach for it are the ones genuinely holding an interval that
 *  came from somewhere else: a checkout request naming one, or a stored
 *  subscription that bills monthly. Dropping the argument would make those call
 *  sites assert annual rather than check it. Display code should call
 *  `formatTierPrice` instead, which has no interval to get wrong. */
export function getTierPrice(
  id: PricingTierId,
  interval: BillingInterval
): TierPrice | null {
  if (interval !== SELLING_INTERVAL) return null;
  return PRICING_TIERS[id].prices?.annual ?? null;
}

/** A tier's price as a customer reads it: "₦5,000/year". Null for a sales-led
 *  tier, which must render "Let's talk" instead.
 *
 *  NO INTERVAL ARGUMENT, on purpose. Every tier is billed once a year, so a
 *  parameter here would only ever be passed one value — and the display surface
 *  that got it wrong would print a monthly figure, which the annual-only spec
 *  names as the one thing that must appear nowhere. The absence of the argument
 *  is the guarantee.
 *
 *  "/year" spelled out rather than "/yr", per the founder's copy rules: the
 *  page has to read at a fifth-grade level and an abbreviation is one more
 *  thing to decode. */
export function formatTierPrice(id: PricingTierId): string | null {
  const price = getTierPrice(id, SELLING_INTERVAL);
  if (!price) return null;
  const formatted = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(price.amount);
  return `${formatted}/year`;
}
