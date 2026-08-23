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
// LABEL'S PRICES ARE DELIBERATELY IDENTICAL TO THE LIVE monthly/annual
// AMOUNTS (₦80,000 / ₦800,000), and that is what makes this migration cheap:
//   - monthly → label @ monthly, annual → label @ annual, same figures
//     against the SAME Paystack Plan objects. No existing or in-flight
//     subscriber changes price.
//   - Only MANAGER needs new Plan objects minted. See the ops note below.
//   - Today's `label` tier above is contactSales and unreachable (it is
//     absent from subscriptions_plan_check and PAYSTACK_PLAN_LABEL_* is
//     unset, so checkout 500s before the CHECK could reject it). It maps
//     onto `enterprise` here, which is the same offer under a clearer name.
// A unit test pins Label's amounts to BILLING_PLANS' so the two cannot drift
// apart while they share Plan objects.
//
// NGN only, matching the launch decision. USD is absent rather than zero:
// USD checkout has never worked (the Paystack account offers NGN only in
// plan creation), and carrying a USD figure here is how the currency toggle
// ended up advertising two prices that were not the same offer.

export type PricingTierId = 'manager' | 'label' | 'enterprise';
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
  /** NGN prices per interval. Absent entirely on a sales-led tier, so a
   *  caller cannot accidentally render a price we never quoted. */
  prices?: Record<BillingInterval, TierPrice>;
  /** The countable ceilings. See TierLimits for why they live here. */
  limits: TierLimits;
  /** The non-countable things this tier includes, in customer words.
   *
   *  Written out rather than derived, because these are claims about the
   *  product and each one has to be true today. Nothing here may name an
   *  unbuilt feature: `sso` and `sub_teams` are declared in the entitlement map
   *  and read by nothing, so they are deliberately ABSENT from Enterprise's
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
  manager: {
    id: 'manager',
    label: 'Manager',
    audience: 'For an independent manager running one or two artists.',
    prices: {
      monthly: { amount: 35_000, minorUnit: 35_000_00 },
      annual: { amount: 350_000, minorUnit: 350_000_00 },
    },
    limits: { seats: 4, activeReleases: 3, urgansMonthlyActions: 150 },
    perks: [
      'The full 11-week rollout plan, written by hand',
      'Files, credits and press kits on every release',
      'Export everything you put in, any time',
      'Email support',
    ],
  },
  label: {
    id: 'label',
    label: 'Label',
    audience: 'For a label or a team running a roster.',
    prices: {
      // Identical to BILLING_PLANS.monthly / .annual on purpose — see the
      // block comment above. Pinned by a test.
      monthly: { amount: 80_000, minorUnit: 80_000_00 },
      annual: { amount: 800_000, minorUnit: 800_000_00 },
    },
    limits: { seats: null, activeReleases: null, urgansMonthlyActions: null },
    perks: [
      'Everything in Manager',
      'Save your own rollout templates',
      'We set your roster up with you',
      'WhatsApp support, answered same day',
    ],
    recommended: true,
  },
  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    audience: 'For distributors and groups operating several labels.',
    // No prices at all: an enterprise deal is quoted per contract and
    // invoiced by hand. There is no Paystack plan code for it.
    limits: { seats: null, activeReleases: null, urgansMonthlyActions: null },
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

/** Card order on the pricing page: entry point, the tier we sell, sales-led. */
export const PRICING_TIER_ORDER: readonly PricingTierId[] = [
  'manager',
  'label',
  'enterprise',
] as const;

/** Annual is billed as ten months, so two are free. Used for the saving copy,
 *  which the spec requires be phrased as "2 months free" and never as a
 *  percentage. */
export const ANNUAL_MONTHS_BILLED = 10;

/** The annual saving, phrased the one way the spec allows.
 *
 *  Never a percentage, by requirement: "2 months free" is what a manager can
 *  check against their own bank statement, and a percentage invites an argument
 *  about how it was calculated. Derived from ANNUAL_MONTHS_BILLED so repricing
 *  cannot leave this line stale. Null for a tier with no annual price. */
export function annualSavingCopy(id: PricingTierId): string | null {
  if (!PRICING_TIERS[id].prices) return null;
  const free = 12 - ANNUAL_MONTHS_BILLED;
  return `${free} months free`;
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
export function tierHighlights(id: PricingTierId): string[] {
  const { limits, perks } = PRICING_TIERS[id];
  const lines: string[] = [];

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

  return [...lines, ...perks];
}

export function getTier(id: PricingTierId): PricingTierDefinition {
  return PRICING_TIERS[id];
}

export function isPricingTierId(value: unknown): value is PricingTierId {
  return value === 'manager' || value === 'label' || value === 'enterprise';
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'annual';
}

/** Null for a sales-led tier — callers must render "Let's talk", not ₦0. */
export function getTierPrice(
  id: PricingTierId,
  interval: BillingInterval
): TierPrice | null {
  return PRICING_TIERS[id].prices?.[interval] ?? null;
}

/** Formats a tier's price with its cycle suffix, e.g. "₦80,000/mo".
 *  Deliberately NOT formatPlanCyclePrice, which derives the suffix from
 *  `id === 'monthly'` — correct for the legacy plans where the id IS the
 *  interval, and silently wrong here where it never is. */
export function formatTierCyclePrice(
  id: PricingTierId,
  interval: BillingInterval
): string | null {
  const price = getTierPrice(id, interval);
  if (!price) return null;
  const formatted = new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(price.amount);
  return `${formatted}${interval === 'monthly' ? '/mo' : '/yr'}`;
}
