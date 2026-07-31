import type { Metadata } from "next";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import {
  RELEASE_ROOM_MEMBER_COUNT,
  WHATSAPP_COMMUNITY_URL,
} from "@/lib/community";

// The invite link + member count now live in lib/community.ts (2026-07-31)
// so this page and the landing ReleaseRoomSection can't drift from each
// other. Same link as the in-app "Community" entry in
// apps/web/components/app/HelpMenu.tsx and the community.urganize.app host
// redirect in next.config.ts — this page is the front door for both.

export const metadata: Metadata = buildPageMetadata({
  title: "Community",
  description:
    "Join The Release Room, Urganize's WhatsApp community for artist managers and small labels running releases.",
  path: "/community",
});

export default function CommunityPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            Community
          </p>
          <h1 className="mt-6 text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-[3.6rem]">
            The Release Room
          </h1>
          <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
            A WhatsApp group for artist managers and small labels running
            releases. Trade notes, ask questions, and see how other teams
            handle the same chaos Urganize is built to fix.
          </p>
          {RELEASE_ROOM_MEMBER_COUNT !== null ? (
            <p className="mt-3 font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
              {RELEASE_ROOM_MEMBER_COUNT} MEMBERS · WHATSAPP · FREE
            </p>
          ) : null}

          <div className="mt-10">
            <a
              href={WHATSAPP_COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-[60] inline-flex touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] sm:text-base"
            >
              Join on WhatsApp
            </a>
          </div>

          <section className="mt-16 border-t border-[color:var(--marketing-border)] py-10 sm:py-12">
            <h2 className="text-xl font-semibold tracking-[-0.02em]">
              Who it&apos;s for
            </h2>
            <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
              Managers and small teams coordinating more than one
              artist&apos;s releases. No pitch, no spam, just people running
              rollouts comparing notes.
            </p>
          </section>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
