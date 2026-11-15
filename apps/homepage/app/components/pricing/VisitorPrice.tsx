"use client";

import { formatTierFromPrice, formatTierPrice, getTier, type BillingInterval, type PricingTierId } from "@urganize/pricing";
import { useVisitorCurrency } from "@/lib/visitor-currency";

/**
 * A plan's price in the visitor's currency (#1120): "₦15,000/month" in
 * Nigeria, "$28/month" everywhere else, "Custom" for Label. For server-rendered
 * sections: it renders the Naira price first and swaps to dollars once the
 * page knows where the visitor is.
 */
export function VisitorPrice({
  tierId,
  interval = "monthly",
  fallback = "Let’s talk",
}: {
  tierId: PricingTierId;
  interval?: BillingInterval;
  fallback?: string;
}) {
  const currency = useVisitorCurrency();
  const price = getTier(tierId).contactSales
    ? formatTierFromPrice(tierId, interval)
    : formatTierPrice(tierId, interval, currency);
  return <span data-visitor-price>{price ?? fallback}</span>;
}
