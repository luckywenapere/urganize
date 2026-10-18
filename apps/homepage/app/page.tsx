import type { Metadata } from "next";
import { FAQ_ITEMS } from "@/content/faq";
import {
  buildPageMetadata,
  LANDING_DESCRIPTION,
  LANDING_TITLE,
} from "@/lib/seo";
import {
  AffiliationsSection,
  FaqSection,
  FeatureGridSection,
  FinalCTASection,
  HeroSection,
  PainSection,
  PricingStripSection,
  ProofSection,
  StorySection,
} from "./components/landing/Sections";
import { LOGIN_REDIRECT_SCRIPT } from "@/lib/login-redirect";
import { HERO_VARIANT_SCRIPT } from "@/lib/hero-variant";
import { homeFontVariables } from "./components/landing/home-fonts";
import { MarketingFooter } from "./components/marketing/MarketingFooter";
import { MarketingHeader } from "./components/marketing/MarketingHeader";

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

// FAQPage structured data, built from the SAME array FaqSection renders, so
// the markup and the schema cannot disagree. It lives here and not in
// layout.tsx on purpose: the layout wraps every route, and a FAQPage stamped
// on /pricing or /terms would describe questions those pages do not carry.
// Google shows FAQ rich results to few sites since 2023; the value here is
// semantic, not a promised SERP feature.
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default function Home() {
  return (
    // `home-v2` scopes the product's tokens and type to this page only
    // (globals.css, 2026-10-17, URG-334).
    <div className={`home-v2 ${homeFontVariables} min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]`}>
      {/* Signed-in visitors go straight to the app, before anything below is
          painted. Home page only: /pricing, /features and /login stay readable
          (and /login exists for search). See lib/login-redirect.ts. */}
      <script dangerouslySetInnerHTML={{ __html: LOGIN_REDIRECT_SCRIPT }} />
      {/* Hero A/B arm (URG-376), set on <html> before the hero is parsed so
          neither arm flashes the other. See lib/hero-variant.ts. */}
      <script dangerouslySetInnerHTML={{ __html: HERO_VARIANT_SCRIPT }} />
      <div className="relative">
        <MarketingHeader />

        <main>
          {/* Seven beats (2026-09-02 overhaul, URG-240; RosterSection and
              UrgAnsSection both removed 2026-09-11, same founder call — see
              components/landing/Sections.tsx for what each said and why
              nothing replaced them), one ask repeated three times (hero,
              pricing, final): the hero names the buyer and shows the
              product; the story opens each of three steps with how the
              work runs today, leading straight into one large quote; three
              tiles for everything else; the price, rendered from the
              pricing package; the objections; the final ask with the
              waitlist folded behind a link.

              Removal history lives in components/landing/Sections.tsx. The
              2026-08-25 five-beat page (hero + video, stats, screenshot,
              three features, final form) is in git history under that date. */}
          {/* HOMEPAGE V2 (2026-10-17, URG-334, mock awaiting founder
              approval): hook (hero with the waitlist form) -> trust -> pain
              -> A, B, C -> proof -> extras -> price -> questions -> the ask
              again. The briefs are in the Urganize Home Page Optimization
              project (landing-overhaul/01-06). */}
          <HeroSection />
          {/* Affiliations strip directly under the hero (2026-10-07, founder call). */}
          <AffiliationsSection />
          <PainSection />
          <StorySection />
          <ProofSection />
          <FeatureGridSection />
          <PricingStripSection />
          <FaqSection />
          <FinalCTASection />
        </main>

        <MarketingFooter />
        <script
          type="application/ld+json"
          // JSON.stringify output of our own constants; nothing user-supplied.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      </div>
    </div>
  );
}
