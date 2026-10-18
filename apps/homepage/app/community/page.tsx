import type { Metadata } from "next";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { CORE_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { WHATSAPP_COMMUNITY_URL } from "@/lib/community";
import { PageDawn } from "../components/marketing/PageDawn";

// The invite link lives in lib/community.ts (2026-07-31). The landing
// CommunitySection was removed 2026-08-19, so this page is now the ONLY
// marketing surface for the group. Same link as the in-app "Community"
// entry in apps/web/components/app/HelpMenu.tsx and the
// community.urganize.app host redirect in next.config.ts — this page
// is the front door for both.
//
// Retitled from "The Release Room" 2026-07-31 (founder call): it works
// better as a general group chat than a named, scoped "room," and
// engagement backs that up.

export const metadata: Metadata = buildPageMetadata({
  title: "Community",
  description:
    `${CORE_LINE} Join our community, a group chat for people running rollouts.`,
  path: "/community",
  // Kept out of search so the homepage's sitelinks stay commercial
  // (Features / Pricing / For executives / For managers). The page stays public
  // and footer-linked — it just never competes as a search result.
  noIndex: true,
});

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-3xl">
          <PageDawn>
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Community
            </p>
            <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
              The Urganize community
            </h1>
            <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
              A group chat for artists and managers running rollouts. Trade
              notes, ask questions, and see how other teams handle the same mess
              Urganize fixes.
            </p>

            <div className="mt-10">
              <a
                href={WHATSAPP_COMMUNITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="relative z-[60] inline-flex touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] sm:text-base"
              >
                Join the community
              </a>
            </div>
          </PageDawn>

          <section className="mt-16 border-t border-[color:var(--marketing-border)] py-10 sm:py-12">
            <h2 className="text-xl">
              Who it&apos;s for
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              Managers and small teams running more than one
              artist&apos;s rollouts. No pitch and no spam. Just managers
              comparing notes on real rollouts.
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
