import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { PricingPageClient } from "./PricingPageClient";

// The description has to match what the page actually serves, because it is what
// renders under the brand result. It named no figure while the page was
// demo-gated and names the offer now that the table is unconditional (see
// PricingPageClient for why that gate is gone). A stale snippet here is a
// promise a visitor arrives to find broken.
//
// The 2026-08-14 lesson still governs the wording: lead with what the visitor
// GETS. This used to open "No price list yet", and since Pricing is a standing
// sitelink candidate, that negative rendered right beneath the homepage in
// search.
export const metadata: Metadata = buildPageMetadata({
  title: "Pricing",
  description:
    "One price for your whole team, from a single manager to a full roster. See what each plan includes and book a demo with the founders.",
  path: "/pricing",
});

// STILL STATICALLY RENDERED, and keep it that way. The geo-resolved currency
// default (x-vercel-ip-country → NGN/USD) that once lived here went with the old
// price table in 2026-07-23 and does NOT come back with the tier table: the tiers
// are NGN-only by design, so there is no currency to resolve and nothing here
// reads a request header. The interval toggle is client state, not a server read.
//
// Note what static rendering costs, since it is the whole reason the old feature
// flag was unworkable: anything this page reads from the environment is frozen at
// BUILD time. That is fine now that there is nothing to read.
export default function PricingPage() {
  return <PricingPageClient />;
}
