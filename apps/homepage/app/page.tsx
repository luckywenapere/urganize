import type { Metadata } from "next";
import { MarketingFooter } from "./components/marketing/MarketingFooter";
import { MarketingHeader } from "./components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import {
  CommunitySection,
  FinalCTASection,
  HeroSection,
  TemplatePlanSection,
  ThreeFeaturesSection,
  TransformationSection,
  WorkspaceShotSection,
} from "./components/landing/Sections";

// This title/description render verbatim (the home page sits at the same
// route segment as the root layout, so layout.tsx's "%s | Urganize"
// template does not apply here — write the full string, not just the page
// name). metadataBase/keywords/robots are inherited from the root layout.
export const metadata: Metadata = buildPageMetadata({
  title: "Urganize | Music Release Management for Teams",
  description:
    "How labels and artist managers run releases with their team, so nothing slips through WhatsApp and notes.",
  path: "/",
});

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]">
      <div className="relative">
        <MarketingHeader />

        <main>
          {/* Proof sits at screen two (2026-07-31 reorder), directly after
              the hero, so the credibility check happens before the visitor
              has already decided to leave. Trimmed 2026-08-13 (founder call:
              the page was overwhelming): MirrorSection was cut because it
              made the hero's WhatsApp/scattered-notes argument a third time,
              and AskAISection was cut because it sent visitors off-site to
              three AI chatbots one scroll before the final CTA. Rebuild both
              from git history if either beat is ever wanted back. */}
          <HeroSection />
          <TransformationSection />
          <WorkspaceShotSection />
          <TemplatePlanSection />
          <ThreeFeaturesSection />
          <FinalCTASection />
          <CommunitySection />
        </main>

        <MarketingFooter />
      </div>
    </div>
  );
}
