import { headers } from "next/headers";
import {
  DEFAULT_PRICING_CURRENCY,
  type PricingCurrencyCode,
} from "@urganize/pricing";
import { PricingPageClient } from "./PricingPageClient";

// GEO-RESOLVED DEFAULT CURRENCY
//
// Vercel sets x-vercel-ip-country on every request. Nigerian visitors see
// NGN (primary market, matches the Paystack NGN flow); everyone else sees
// USD. When the header is absent (local dev, non-Vercel hosts) we fall
// back to the package default (NGN) rather than guessing.
//
// Reading headers() opts this route into dynamic rendering — that's the
// cost of per-visitor defaults and it's fine at marketing-site traffic.
// The visitor can always switch manually via the toggle on the page.
function resolveCurrencyForCountry(country: string | null): PricingCurrencyCode {
  if (!country) return DEFAULT_PRICING_CURRENCY;
  return country === "NG" ? "NGN" : "USD";
}

export default async function PricingPage() {
  const requestHeaders = await headers();
  const country = requestHeaders.get("x-vercel-ip-country");

  return <PricingPageClient initialCurrency={resolveCurrencyForCountry(country)} />;
}
