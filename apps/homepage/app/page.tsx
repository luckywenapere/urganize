import type { Metadata } from "next";
import { MarketingFooter } from "./components/marketing/MarketingFooter";
import { MarketingHeader } from "./components/marketing/MarketingHeader";
import {
  FinalCTASection,
  HeroSection,
  MirrorSection,
  TemplatePlanSection,
  TestimonialSection,
  ThreeFeaturesSection,
} from "./components/landing/Sections";

const TITLE = "Urganize — Your release deserves a process.";
const DESCRIPTION =
  "The system of record for music releases. A hand-crafted rollout plan, tasks with owners and due dates, and every release file in one workspace. Built for music managers. Free for 28 days.";

// OG/Twitter images intentionally omitted: Next.js serves the branded card
// at app/opengraph-image.png via the file convention. Do not point these at
// product screenshots unless they show the CURRENT app.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://urganize.app"),
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://urganize.app",
    siteName: "Urganize",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  keywords: [
    "music release management",
    "artist release tool",
    "release rollout plan",
    "music release checklist",
    "release workflow",
    "artist team software",
    "music manager software",
  ],
  robots: {
    index: true,
    follow: true,
  },
};

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]">
      <div className="relative">
        <MarketingHeader />

        <main>
          <HeroSection />
          <MirrorSection />
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
