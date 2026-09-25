import type { Metadata } from "next";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { changelog, CURRENT_VERSION } from "../../content/changelog";
import { CORE_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Updates",
  description:
    `Every Urganize update, newest first: what changed and when. ${CORE_LINE}`,
  path: "/changelog",
  // Kept out of search so the homepage's sitelinks stay commercial
  // (Features / Pricing / For executives / For managers). The page stays public
  // and footer-linked — it just never competes as a search result.
  noIndex: true,
});

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center gap-4">
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Product updates
            </p>
            <span className="mono-label rounded-full border border-[color:var(--marketing-border-strong)] px-3 py-1 text-[var(--marketing-text-muted)]">
              Current version · v{CURRENT_VERSION}
            </span>
          </div>
          <h1 className="mt-6 text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-[3.6rem]">
            Updates
          </h1>
          <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
            Every Urganize update, newest first.
          </p>

          <div className="mt-12 space-y-px bg-[color:var(--marketing-border)]">
            {changelog.map(({ version, date, highlights }) => (
              <div key={version} className="bg-[var(--marketing-bg)] py-8">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="text-xl font-semibold tracking-[-0.02em]">
                    v{version}
                  </h2>
                  <span className="mono-label text-[var(--marketing-text-subtle)]">
                    {date}
                  </span>
                </div>
                <ul className="mt-4 list-disc space-y-2 pl-5">
                  {highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="leading-7 text-[var(--marketing-text-muted)]"
                    >
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
