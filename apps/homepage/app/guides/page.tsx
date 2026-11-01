import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { GUIDES } from "@/content/guides";
import { SHORT_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";
import { TrialButton } from "../components/landing/TrialButton";

export const metadata: Metadata = buildPageMetadata({
  title: "Guides to planning a music release",
  description:
    `Plain guides for artists and managers: the release timeline, who does what and how to pitch playlists. ${SHORT_LINE}`,
  path: "/guides",
  shareCard: "guides",
});

export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20 isolate overflow-x-clip">
        <div className="mx-auto max-w-4xl">
          <PageDawn>
            <p className="mono-label text-[var(--marketing-text-subtle)]">Guides</p>
            <h1 className="mt-6 text-balance text-[2.25rem] leading-[1.08] sm:text-[3rem]">
              Plan a music release, step by step
            </h1>
            <p className="mt-4 max-w-[38rem] text-[var(--marketing-text-muted)]">
              Plain answers for managers who&rsquo;d rather not learn the hard way. Each one
              comes from the plan Urganize builds for a single.
            </p>
          </PageDawn>

          <ul className="mt-12 divide-y divide-[color:var(--marketing-border)] border-y border-[color:var(--marketing-border)]">
            {GUIDES.map((guide) => (
              <li key={guide.slug}>
                <Link
                  href={`/guides/${guide.slug}`}
                  className="group block py-7 transition-colors hover:bg-[var(--marketing-surface)]"
                >
                  <h2 className="text-xl group-hover:underline group-hover:underline-offset-4 sm:text-2xl">
                    {guide.title}
                  </h2>
                  <p className="mt-2 max-w-[40rem] text-[var(--marketing-text-muted)]">
                    {guide.summary}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {/* Closing ask (2026-10-19, founder call). */}
          <div className="mt-12 flex flex-col items-start gap-4">
            <p className="text-[var(--marketing-text-muted)]">
              Want this plan built for your next release?
            </p>
            <TrialButton location="guide_cta" />
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
