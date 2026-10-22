// Plan-string → expires_at mapping for `subscriptions.expires_at`.
//
// Used by the webhook to compute the new `expires_at` on initial charge.
// Renewal extensions use `advancePeriodEnd` from lib/billing-plans.ts
// (which extends from the current period end, not from `now`, so a late
// renewal doesn't truncate the user's paid window).
//
// Display prices, plan codes, and currency formatting all live in
// @urganize/pricing (shared between apps) and lib/billing-plans.ts
// (server-only Paystack glue). Nothing else needs to live here.

import { resolveBillingInterval } from './billing-plans';

/**
 * How long a successful first charge should buy.
 *
 * `interval` matters for exactly one reason, and it is the bug this argument
 * exists to fix: under pricing v2 the plan string is a TIER ('manager',
 * 'label') and no longer says whether the customer bought monthly or annual.
 * Matching on the name alone gave a Label-monthly buyer a full year and a
 * Manager-annual buyer one month. Pass the interval recorded at checkout
 * (payments.paystack_response.selected_interval, then
 * subscriptions.billing_interval) whenever the plan is a tier.
 *
 * Optional, so every legacy call site keeps its exact previous behaviour: for
 * the legacy ids the name IS the interval, and `resolveBillingInterval` infers
 * the same answer this function used to hardcode.
 */
export const getPlanExpiry = (
  plan: string,
  now = new Date(),
  interval?: string | null
): Date => {
  const expiresAt = new Date(now);

  // 'custom' is the contact-sales tier — admin-provisioned, no Paystack
  // involvement. Pegged to far-future so the rare webhook callsite (none
  // today, but the type allows it) doesn't accidentally set a short
  // window. Admin paths set their own expires_at directly.
  //
  // 'enterprise' was Group's pricing-v2 id and was handled the same way for
  // the same reason: quoted per contract, invoiced by hand, never charged
  // through self-serve checkout. Group was removed from @urganize/pricing
  // entirely on 2026-09-09 (no `PricingTierId` member left for it), but the
  // string check stays here as a defensive branch: `subscriptions_plan_check`
  // still permits a stored row to carry 'enterprise' from before that date
  // (no migration narrowed it — see the removal note in
  // packages/pricing/src/index.ts), and it is deliberately absent from
  // isRecurringPlan, so a charge event cannot reach here with it — but if one
  // ever does, a far-future window beats a silent one-month window on a deal
  // somebody signed for a year.
  if (plan === 'custom' || plan === 'enterprise') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 100);
    return expiresAt;
  }

  // 'access' is the flat-tier ₦15,000 SKU credited by the (now retired)
  // standalone Paystack Payment Page flow. No new rows are created — kept
  // mapping to 1 year so the 3 grandfathered customers lapse naturally.
  //
  // Everything else routes through the shared resolver: a stored interval
  // wins, then legacy plan-name inference ('annual' / 'yearly' / 'label' →
  // annual), then monthly. See resolveBillingInterval for why monthly is the
  // safe default rather than annual.
  const resolved = resolveBillingInterval({ plan, storedInterval: interval });
  if (resolved === 'annual') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    return expiresAt;
  }
  if (resolved === 'six_month') {
    expiresAt.setMonth(expiresAt.getMonth() + 6);
    return expiresAt;
  }

  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return expiresAt;
};
