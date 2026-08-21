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
// OPERATIONAL FOLLOW-UP REQUIRED — this file is the DISPLAY price only.
// The live Paystack Plan objects behind PAYSTACK_PLAN_MONTHLY_NGN /
// PAYSTACK_PLAN_ANNUAL_NGN still bill ₦150,000 / ₦1,500,000. Until two new
// Plan objects are created at ₦80,000 / ₦800,000 and those env vars are
// repointed in Vercel, checkout will advertise ₦80,000 and charge ₦150,000.
// This exact gap has now come up FOUR times (2026-07-14 shipped constants
// with no Plans; 2026-07-15 closed it; 2026-08-16 reopened it; this pass
// inherits it) — treat it as the default follow-up on any reprice, and note
// that switching the hard paywall on before closing it means the first team
// to pay is overcharged by ~2x.
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
