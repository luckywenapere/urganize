import type { Metadata } from "next";
import { MarketingFooter } from "./components/marketing/MarketingFooter";
import { MarketingHeader } from "./components/marketing/MarketingHeader";
import {
  buildPageMetadata,
  LANDING_DESCRIPTION,
  LANDING_TITLE,
} from "@/lib/seo";
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
// template does not apply here — the constant is the full string, not just
// the page name). metadataBase/keywords/robots are inherited from the root
// layout. Both strings come from lib/seo.ts so this page and the layout's
// JSON-LD schemas cannot describe the product differently.
export const metadata: Metadata = buildPageMetadata({
  title: LANDING_TITLE,
  description: LANDING_DESCRIPTION,
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
