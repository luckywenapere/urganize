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
  type BillingPlanId,
  type PricingCurrencyCode,
} from '@urganize/pricing';

export type RecurringPlanId = BillingPlanId; // 'monthly' | 'annual' | 'label'

// Map of (plan, currency) → env var name that holds the Paystack plan
// code. Defined as a constant so a typo in any one branch surfaces here,
// not in a "plan not configured" error at checkout time.
const PLAN_CODE_ENV_VAR: Record<RecurringPlanId, Record<PricingCurrencyCode, string>> = {
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

/**
 * Resolve the Paystack plan code (PLN_xxx) for a given plan + currency
 * combo. Returns the env var value verbatim, trimmed; returns null if the
 * env var is unset or empty. Caller is responsible for surfacing a
 * user-readable error ("plan not configured") on null.
 */
export function getPaystackPlanCode(
  plan: RecurringPlanId,
  currency: PricingCurrencyCode
): string | null {
  const envName = PLAN_CODE_ENV_VAR[plan]?.[currency];
  if (!envName) return null;
  const value = process.env[envName];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

/**
 * How long the new `expires_at` should be after a successful charge for
 * each plan. Used on the initial charge AND every renewal.
 *
 * On renewal, the webhook reads the current `expires_at` and advances by
 * one period — NOT `now + period`. This way a renewal that arrives a day
 * late (Paystack retry, slow webhook delivery) doesn't shorten the user's
 * paid window.
 */
export function advancePeriodEnd(plan: RecurringPlanId, currentEnd: Date | null, now: Date): Date {
  // Base is whichever is later: the current period end (so we extend, not
  // truncate) or now (so a long-cancelled customer who pays again starts
  // a fresh period from today, not from their old expires_at).
  const base = currentEnd && currentEnd.getTime() > now.getTime() ? new Date(currentEnd) : new Date(now);
  // Period length comes from the shared plan definition, not a hardcoded
  // plan-id check — 'annual' and 'label' both bill annually.
  if (BILLING_PLANS[plan].interval === 'annually') {
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
export const RECURRING_PLAN_IDS: readonly RecurringPlanId[] = ['monthly', 'annual', 'label'] as const;

export function isRecurringPlan(plan: string): plan is RecurringPlanId {
  return plan === 'monthly' || plan === 'annual' || plan === 'label';
}

/**
 * Whole-unit display amount for a plan + currency. Re-exported here so the
 * server checkout init can pass `amount` to Paystack without round-trip
 * through the shared package on every call. Lives here so callers stay on
 * the server-only module and don't accidentally import the whole pricing
 * package from a server-only callsite (which would also work, but adds
 * one more module to keep an eye on).
 */
export function getPlanMinorUnit(plan: RecurringPlanId, currency: PricingCurrencyCode): number {
  return BILLING_PLANS[plan].prices[currency].minorUnit;
}

/**
 * Grace period buffer applied when looking at past_due subscriptions. The
 * snapshot resolver in lib/subscription-access.ts treats past_due + not
 * expired as paid, so this constant is informational only — exported in
 * case a future "you're past due" banner wants to show the cutoff.
 */
export const PAYSTACK_RETRY_GRACE_DAYS = 3;
