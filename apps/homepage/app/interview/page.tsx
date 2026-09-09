import type { Metadata } from "next";
import { InterviewForm } from "../components/interview/InterviewForm";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { SectionShell } from "../components/landing/SectionShell";
import { CUSTOMER_LINE } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";

// Sent directly to specific artists, not discovered — noindex, not in the
// sitemap, not linked from ProductMenu or anywhere else on the site.
export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Book an interview",
    description: `Pick a day and time to talk to us about Urganize, the ${CUSTOMER_LINE}.`,
    path: "/interview",
  }),
  robots: { index: false, follow: false },
};

export default function InterviewPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]">
      <MarketingHeader />

      <main>
        <SectionShell
          className="pb-20 pt-16 sm:pt-20"
          containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
        >
          <div className="mx-auto max-w-[40rem] text-center">
            <p className="mono-label text-[var(--marketing-text-subtle)]">Interview</p>
            <h1 className="mt-6 text-balance text-[2.4rem] font-semibold leading-[1.05] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[3rem]">
              We&apos;d like to talk to you.
            </h1>
            <p className="mx-auto mt-4 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
              Fill in your details and pick a weekday slot below. Every interview runs at 6pm
              West Africa Time — once a day is taken, it&apos;s off the list.
            </p>
          </div>

          <div className="mt-10">
            <InterviewForm />
          </div>
        </SectionShell>
      </main>

      <MarketingFooter />
    </div>
  );
}
