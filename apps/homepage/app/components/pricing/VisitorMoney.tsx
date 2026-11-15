"use client";

import { EXTRA_RELEASE_PRICE_NAIRA, EXTRA_RELEASE_PRICE_USD, formatMoney } from "@urganize/pricing";
import type { FaqPrice } from "@/content/faq";
import { useVisitorCurrency } from "@/lib/visitor-currency";

const AMOUNTS: Record<FaqPrice, { NGN: number; USD: number }> = {
  single: { NGN: EXTRA_RELEASE_PRICE_NAIRA, USD: EXTRA_RELEASE_PRICE_USD },
};

/** A fixed amount in the visitor's currency (#1301): "₦2,000" in Nigeria,
 *  "$1.50" everywhere else. */
export function VisitorMoney({ price }: { price: FaqPrice }) {
  const currency = useVisitorCurrency();
  return <span data-visitor-price>{formatMoney(AMOUNTS[price][currency], currency)}</span>;
}
