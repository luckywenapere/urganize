import type { Metadata } from "next";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Why Urganize over WhatsApp and Google Drive",
  description:
    "WhatsApp and Google Drive work for one artist and one release. Urganize is for when you're running several: a real rollout plan, owned tasks, files where they belong, and status at a glance.",
  path: "/why-urganize",
});

// Same honesty rule as /features: every Urganize claim below describes the
// product as it ships today, and every WhatsApp/Drive line describes the
// workflow managers actually run before switching. No invented numbers, no
// imaginary features, no trash-talking tools people rely on.
const comparisons = [
  {
    kicker: "The plan",
    title: "A rollout, not a pinned message.",
    them: "The plan lives in a pinned message, a spreadsheet someone made once, and your head. Every release starts from a blank page and whatever you remember from the last one.",
    us: "Create a release and Urganize lays out a hand-crafted 11-week rollout: 64 tasks from locking the master to compiling first-week stats. Fully editable before you commit.",
  },
  {
    kicker: "Ownership",
    title: "Assigned, not announced.",
    them: "Work gets assigned by message, so “did you see my text?” becomes the follow-up system. A scrolled-past message is a missed deadline nobody notices until it costs you.",
    us: "Every task has an owner, a due date, and a priority. Dependencies keep the order honest: blocked tasks show exactly what's blocking them and unlock the moment it clears.",
  },
  {
    kicker: "Files",
    title: "Attached to the release, not scattered around it.",
    them: "Masters in Drive, artwork in the group chat, the contract in email. The night before delivery is an excavation across three apps and four folder-naming schemes.",
    us: "Masters, artwork, contracts, and split sheets attach to the release they belong to, organized by category, with image previews. One place, every time.",
  },
  {
    kicker: "Status",
    title: "Seen at a glance, not asked again.",
    them: "Knowing where a release stands means scrolling back through weeks of chat, or asking someone to repeat what they already told you. Multiply that by every release you're running.",
    us: "One workspace shows every release in flight: progress, what's overdue, what's due this week. The status conversation stops being a meeting.",
  },
] as const;

const headlineClass =
  "text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[3.6rem]";

export default function WhyUrganizePage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]">
      <MarketingHeader />

      <main>
        {/* HERO */}
        <SectionShell
          className="pb-16 pt-16 sm:pt-20"
          containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10"
        >
          <div className="mx-auto max-w-[46rem] text-center">
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              Why Urganize
            </p>
            <h1 className="mt-8 text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem]">
              WhatsApp and Drive got you here.{" "}
              <span className="italic text-[var(--marketing-accent)]">
                They won&apos;t get you further.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              For one artist and one release, a group chat and a Drive folder
              genuinely work. Add a second release, a third artist, a team
              handing work back and forth, and the system that got you here
              starts costing you releases.
            </p>
          </div>
        </SectionShell>

        {/* COMPARISON BLOCKS */}
        {comparisons.map((item) => (
          <ScrollReveal key={item.title}>
            <SectionShell
              className="py-[60px] lg:py-[80px]"
              containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
            >
              <div className="mx-auto max-w-[64rem] border-t border-[color:var(--marketing-border)] pt-14">
                <p className="mono-label text-[var(--marketing-accent)]">
                  {item.kicker}
                </p>
                <h2 className={`mt-5 max-w-[38rem] ${headlineClass}`}>
                  {item.title}
                </h2>

                <div className="mt-10 grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2">
                  <div className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8">
                    <p className="mono-label text-[var(--marketing-text-subtle)]">
                      In WhatsApp + Drive
                    </p>
                    <p className="mt-4 text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                      {item.them}
                    </p>
                  </div>
                  <div className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8">
                    <p className="mono-label text-[var(--marketing-accent)]">
                      In Urganize
                    </p>
                    <p className="mt-4 text-[0.95rem] leading-7 text-[var(--marketing-text)]">
                      {item.us}
                    </p>
                  </div>
                </div>
              </div>
            </SectionShell>
          </ScrollReveal>
        ))}

        {/* HONESTY BLOCK */}
        <ScrollReveal>
          <SectionShell
            className="py-[100px] lg:py-[120px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[52rem] text-center">
              <p className="mono-label text-[var(--marketing-text-subtle)]">
                To be clear
              </p>
              <h2 className={`mt-6 ${headlineClass}`}>
                Keep WhatsApp. Keep Drive.
              </h2>
              <p className="mx-auto mt-6 max-w-[38rem] text-balance text-base leading-8 text-[var(--marketing-text-muted)]">
                This isn&apos;t about deleting apps. WhatsApp is still where
                you talk; Drive is still fine for general storage. Urganize is
                how your music gets the release it deserves: the one place
                where the plan lives, the work happens, and the team sees
                status.
              </p>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* FINAL CTA */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={headlineClass}>Give your releases a home.</h2>
              <div className="mt-10 flex w-full flex-col items-center gap-3">
                <WaitlistForm source="why_urganize_cta" />
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>
      </main>

      <MarketingFooter />
    </div>
  );
}
