import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { PricingPageClient } from "./PricingPageClient";

// The description has to match the mode the page is actually serving, because
// it is what renders under the brand result. Naming no figure while the page
// shows three would be a stale snippet; promising prices while the page is
// demo-gated would be worse.
//
// The 2026-08-14 lesson holds in both: lead with what the visitor GETS. This
// description used to open "No price list yet", and since Pricing is a standing
// sitelink candidate, that negative rendered right beneath the homepage in
// search.
const PRICING_V2 = process.env.NEXT_PUBLIC_FEATURE_PRICING_V2 === "true";

export const metadata: Metadata = buildPageMetadata({
  title: "Pricing",
  description: PRICING_V2
    ? "One price for your whole team, from a single manager to a full roster. See what each plan includes and book a demo with the founders."
    : "We set up every team personally. Book a demo with the founders and see Urganize running your own releases. Built for music executives and their teams.",
  path: "/pricing",
});

// STILL STATICALLY RENDERABLE in both modes. The geo-resolved currency default
// (x-vercel-ip-country → NGN/USD) that once lived here went with the old price
// table in 2026-07-23 and does NOT come back with the tier table: the tiers are
// NGN-only by design, so there is no currency to resolve and nothing here reads
// a request header. The interval toggle is client state, not a server read.
// See PricingPageClient for the full context on both modes.
export default function PricingPage() {
  return <PricingPageClient />;
}
