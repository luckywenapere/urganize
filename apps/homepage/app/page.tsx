import type { Metadata } from "next";
import { MarketingFooter } from "./components/marketing/MarketingFooter";
import { MarketingHeader } from "./components/marketing/MarketingHeader";
import {
  buildPageMetadata,
  LANDING_DESCRIPTION,
  LANDING_TITLE,
} from "@/lib/seo";
import {
  FinalCTASection,
  HeroSection,
  StatsSection,
  ThreeFeaturesSection,
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
          {/* The page is five beats (2026-08-25 trim): hero + video, the
              offer (stats), the product (screenshot), three features, the
              final ask. Proof rides as one-line ProofLines under the hero
              and final forms rather than as sections of its own. Removal
              history: MirrorSection and AskAISection cut 2026-08-13
              (founder call: the page was overwhelming — one repeated the
              hero's argument a third time, the other sent visitors
              off-site one scroll before the final CTA). Rebuild any of
              these from git history if a beat is ever wanted back. */}
          {/* CommunitySection was REMOVED 2026-08-19 (founder call: nobody
              clicked it) — the page now ends on the final waitlist CTA, the
              journey's one terminal ask. The /community page and the
              footer's Community link survive; only the landing beat is
              gone. Rebuild from git history if it's ever wanted back. */}
          <HeroSection />
          {/* Stats added 2026-08-25 (founder-supplied figures — the same-day
              removals in WorkspaceShot/FinalCTA asked for exactly these before
              any stat beat returns): the offer in three cards, right under
              the demo video. */}
          <StatsSection />
          {/* TransformationSection (the before/after quote rows) was REMOVED
              2026-08-25, founder call: too bulky for a skimming visitor, and
              every quoted voice survives elsewhere (hero + final-CTA
              ProofLines here; full quotes on /for-managers, /for-executives
              and /why-urganize). Rebuild from git history if the beat is
              ever wanted back. */}
          <WorkspaceShotSection />
          {/* TemplatePlanSection (the playbook excerpt) was REMOVED
              2026-08-25, founder call, in the same trim as the
              before/after rows above. The rollout-plan claim it carried
              still leads the hero ("Urganize plans the rollout...") and
              is spelled out in full on /features, /why-urganize and the
              persona pages. Rebuild from git history if wanted back. */}
          <ThreeFeaturesSection />
          <FinalCTASection />
        </main>

        <MarketingFooter />
      </div>
    </div>
  );
}
