import type { Metadata } from "next";
import Link from "next/link";
import { MarketingFooter } from "./components/marketing/MarketingFooter";
import { MarketingHeader } from "./components/marketing/MarketingHeader";
import { SectionShell } from "./components/landing/SectionShell";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--marketing-bg)] text-[var(--marketing-text)]">
      <MarketingHeader />

      <main>
        <SectionShell containerClassName="max-w-[40rem] px-6 text-center sm:px-8">
          <p className="mono-label text-[var(--marketing-text-subtle)]">404</p>
          <h1 className="mt-6 text-[2.25rem] leading-[1.08] sm:text-[3rem]">
            This page doesn&apos;t exist.
          </h1>
          <p className="mx-auto mt-5 max-w-[30rem] text-lg leading-8 text-[var(--marketing-text-muted)]">
            The link may be old, or the page may have moved. Here&apos;s
            where you can go instead.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] hover:bg-[var(--marketing-primary-hover)] sm:text-base"
            >
              Go home
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center justify-center rounded-full border border-[color:var(--marketing-border-strong)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text)] hover:border-[color:var(--marketing-text)] hover:bg-[var(--marketing-surface)] sm:text-base"
            >
              See features
            </Link>
          </div>
        </SectionShell>
      </main>

      <MarketingFooter />
    </div>
  );
}
