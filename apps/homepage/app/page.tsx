import type { Metadata } from "next";
import { MarketingFooter } from "./components/marketing/MarketingFooter";
import { MarketingHeader } from "./components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import {
  FinalCTASection,
  HeroSection,
  MirrorSection,
  TemplatePlanSection,
  TestimonialSection,
  ThreeFeaturesSection,
  WorkspaceShotSection,
} from "./components/landing/Sections";

// This title/description render verbatim (the home page sits at the same
// route segment as the root layout, so layout.tsx's "%s | Urganize"
// template does not apply here — write the full string, not just the page
// name). metadataBase/keywords/robots are inherited from the root layout.
export const metadata: Metadata = buildPageMetadata({
  title: "Urganize | Music Release Management for Teams",
  description:
    "How labels and artist managers run a release across their freelance team, so tasks and handoffs don't slip through WhatsApp and notes.",
  path: "/",
});

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]">
      <div className="relative">
        <MarketingHeader />

        <main>
          <HeroSection />
          <MirrorSection />
          <WorkspaceShotSection />
          <TemplatePlanSection />
          <ThreeFeaturesSection />
          <TestimonialSection />
          <FinalCTASection />
        </main>

        <MarketingFooter />
      </div>
    </div>
  );
}
