import type { Metadata } from "next";
import { MarketingFooter } from "./components/marketing/MarketingFooter";
import { MarketingHeader } from "./components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import {
  AskAISection,
  CommunitySection,
  FinalCTASection,
  HeroSection,
  MirrorSection,
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
    "How labels and artist managers run releases across their team, so handoffs and tasks don't slip through WhatsApp and notes.",
  path: "/",
});

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]">
      <div className="relative">
        <MarketingHeader />

        <main>
          {/* Reordered 2026-07-31: proof moved from two-thirds down the
              page (screen ~5) to screen two, directly after the hero, so
              the credibility check happens before the visitor has already
              decided to leave. MirrorSection moved down to sit as the
              cost-of-doing-nothing beat right before the second opinion +
              close, rather than breaking up the real-screenshot →
              real-template → mechanics argument in the middle. */}
          <HeroSection />
          <TransformationSection />
          <WorkspaceShotSection />
          <TemplatePlanSection />
          <ThreeFeaturesSection />
          <MirrorSection />
          <AskAISection />
          <FinalCTASection />
          <CommunitySection />
        </main>

        <MarketingFooter />
      </div>
    </div>
  );
}
