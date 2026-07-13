import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildPageMetadata } from "@/lib/seo";
import { RoadmapPageClient } from "./RoadmapPageClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Roadmap",
  description:
    "Vote on what Urganize builds next. Sign in, suggest an idea, and help shape the roadmap.",
  path: "/roadmap",
});

// Flag-gated (matches the tailor-plan/Chappi convention): 404s when off so a
// guessed URL can't hit the page before the Supabase migration is applied and
// the Supabase env vars are configured for this app.
const ROADMAP_ENABLED = process.env.NEXT_PUBLIC_FEATURE_ROADMAP === "true";

export default function RoadmapPage() {
  if (!ROADMAP_ENABLED) {
    notFound();
  }

  return <RoadmapPageClient />;
}
