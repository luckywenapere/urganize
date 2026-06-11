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
   *  / international customers and gets its own Paystack plan code. */
  prices: Record<PricingCurrencyCode, PlanPrice>;
};

// Source of truth for the three recurring tiers. If these values change,
// both the paywall display and the marketing pricing page move together —
// no drift.
//
// Pricing rationale (per product brief):
//   - Monthly NGN: ₦15,000 (matches the previous flat access SKU, makes
//     the migration feel like-for-like for Nigerian customers).
//   - Annual NGN: ₦150,000 (~2 months free vs ₦180,000 paid monthly).
//   - Label NGN: ₦750,000/yr (5× annual; replaced the contact-sales
//     "Custom" tier 2026-06-11 — high-touch roster tier with hands-on
//     onboarding and template tailoring delivered by the founders).
//   - Monthly USD: $25 (diaspora rate, not a strict FX conversion).
//   - Annual USD: $250 (~2 months free vs $300 paid monthly).
//   - Label USD: $1,250 (same 5× annual ratio as NGN).
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
      NGN: { currency: 'NGN', amount: 15_000, minorUnit: 15_000_00 },
      USD: { currency: 'USD', amount: 25, minorUnit: 25_00 },
    },
  },
  annual: {
    id: 'annual',
    label: 'Annual',
    description: 'Billed once a year. ~2 months free vs monthly.',
    interval: 'annually',
    prices: {
      NGN: { currency: 'NGN', amount: 150_000, minorUnit: 150_000_00 },
      USD: { currency: 'USD', amount: 250, minorUnit: 250_00 },
    },
  },
  label: {
    id: 'label',
    label: 'Label',
    description: 'For labels and managers running a roster. Billed once a year.',
    interval: 'annually',
    prices: {
      NGN: { currency: 'NGN', amount: 750_000, minorUnit: 750_000_00 },
      USD: { currency: 'USD', amount: 1_250, minorUnit: 1_250_00 },
    },
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
