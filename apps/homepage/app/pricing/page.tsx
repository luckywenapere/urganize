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
//
// It said "how to book a demo with the founders" until 2026-10-10. Nothing on
// the page books a demo any more: the plan buttons go to the waitlist and
// Group's goes to an email, so the snippet promised a step the page does not
// have. Name the step the page does have.
export const metadata: Metadata = buildPageMetadata({
  // "Pricing for artist managers and their teams" since 2026-10-18 (founder
  // approved, artist-managers-first); it named artists, managers and labels.
  // The root template adds " | Urganize".
  title: "Pricing for artist managers and their teams",
  description:
    "From idea to execution, at one price for your whole team, from a single manager to a full roster. What each plan includes and how to join the waitlist.",
  path: "/pricing",
  shareCard: "pricing",
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
