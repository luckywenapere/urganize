import type { Metadata } from "next";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Press Kit",
  description:
    "Logos, product description, and contact for press inquiries about Urganize.",
  path: "/press",
});

export default function PressPage() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            For media
          </p>
          <h1 className="mt-6 text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] sm:text-[3.6rem]">
            Press Kit
          </h1>
          <p className="mt-4 max-w-[36rem] text-[var(--marketing-text-muted)]">
            Logos, product description, and contact for press inquiries.
          </p>

          <div className="mt-12 space-y-px bg-[color:var(--marketing-border)]">
            <div className="bg-[var(--marketing-bg)] py-8">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">
                Short description
              </h2>
              <p className="mt-3 max-w-[42rem] leading-7 text-[var(--marketing-text-muted)]">
                Urganize is the system of record for music releases: a
                hand-crafted rollout plan, tasks with owners and due dates, and
                every release file in one workspace. Built for labels and
                artist managers running the campaigns.
              </p>
            </div>

            <div className="bg-[var(--marketing-bg)] py-8">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">
                Media contact
              </h2>
              <p className="mt-3 text-[var(--marketing-text-muted)]">
                <a
                  className="text-[var(--marketing-accent)] hover:opacity-80"
                  href="mailto:contact@urganize.app?subject=Urganize%20-%20Press"
                >
                  contact@urganize.app
                </a>
              </p>
            </div>

            <div className="bg-[var(--marketing-bg)] py-8">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Logos</h2>
              <a
                href="/press/urganize-logo.zip"
                download
                className="mt-5 inline-flex items-center justify-center rounded-full border border-[color:var(--marketing-border-strong)] px-6 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text)] hover:border-[color:var(--marketing-text)] hover:bg-[var(--marketing-surface)]"
              >
                Download logos (ZIP)
              </a>
            </div>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
