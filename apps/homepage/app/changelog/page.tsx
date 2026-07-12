import type { Metadata } from "next";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { changelog } from "../../content/changelog";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Changelog",
  description:
    "What's shipped in Urganize, month by month — release templates, tasks, files, and the workspace.",
  path: "/changelog",
});

export default function ChangelogPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            Product updates
          </p>
          <h1 className="mt-6 text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-[3.6rem]">
            Changelog
          </h1>
          <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
            What&apos;s shipped in Urganize, month by month.
          </p>

          <div className="mt-12 space-y-px bg-[color:var(--marketing-border)]">
            {changelog.map(({ month, highlights }) => (
              <div key={month} className="bg-[var(--marketing-bg)] py-8">
                <h2 className="text-xl font-semibold tracking-[-0.02em]">
                  {month}
                </h2>
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
