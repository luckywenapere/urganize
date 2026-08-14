import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { PricingPageClient } from "./PricingPageClient";

// The description leads with what the visitor GETS, not with what the page
// lacks (2026-08-14). It used to open "No price list yet", and since Pricing
// is a standing sitelink candidate under the brand result, that negative was
// rendering right beneath the homepage in search. Still honest — the page is
// genuinely demo-gated and names no figure, per the rule below.
export const metadata: Metadata = buildPageMetadata({
  title: "Pricing",
  description:
    "We set up every team personally. Book a demo with the founders and see Urganize running your own releases. Built for artist managers and small labels.",
  path: "/pricing",
});

// BOOK-A-DEMO MODE (2026-07-23): the page no longer shows prices, so the
// geo-resolved currency default (x-vercel-ip-country → NGN/USD) that used to
// live here is gone with it — this route is statically renderable again.
// See PricingPageClient for the full context and the restore path.
export default function PricingPage() {
  return <PricingPageClient />;
}
