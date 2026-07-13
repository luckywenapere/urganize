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

export const getPlanExpiry = (plan: string, now = new Date()): Date => {
  const expiresAt = new Date(now);

  // 'custom' is the contact-sales tier — admin-provisioned, no Paystack
  // involvement. Pegged to far-future so the rare webhook callsite (none
  // today, but the type allows it) doesn't accidentally set a short
  // window. Admin paths set their own expires_at directly.
  if (plan === 'custom') {
    expiresAt.setFullYear(expiresAt.getFullYear() + 100);
    return expiresAt;
  }

  if (
    plan === 'annual' ||
    // 'label' is the ₦800,000/yr roster tier (repriced 2026-07-14 from
    // ₦750,000) — annual interval, same
    // 1-year expiry as 'annual'.
    plan === 'label' ||
    plan === 'yearly' ||
    // 'access' is the flat-tier ₦15,000 SKU credited by the (now retired)
    // standalone Paystack Payment Page flow. No new rows are created — kept
    // here so the 3 grandfathered customers continue to map to 1 year as
    // their existing rows lapse naturally.
    plan === 'access'
  ) {
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    return expiresAt;
  }

  // Default: monthly recurring.
  expiresAt.setMonth(expiresAt.getMonth() + 1);
  return expiresAt;
};
