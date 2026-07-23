import type { Metadata } from "next";
import { buildPageMetadata } from "@/lib/seo";
import { PricingPageClient } from "./PricingPageClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Pricing",
  description:
    "No price table right now — we set up every team personally. Book a demo with the founders. Built for artist managers and small labels running more than one artist.",
  path: "/pricing",
});

// BOOK-A-DEMO MODE (2026-07-23): the page no longer shows prices, so the
// geo-resolved currency default (x-vercel-ip-country → NGN/USD) that used to
// live here is gone with it — this route is statically renderable again.
// See PricingPageClient for the full context and the restore path.
export default function PricingPage() {
  return <PricingPageClient />;
}
