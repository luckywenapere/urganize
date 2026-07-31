import type { Metadata } from "next";
import { ProofLine } from "../components/landing/ProofLine";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Why Urganize over WhatsApp and Google Drive",
  description:
    "WhatsApp and Google Drive work for one artist and one release. Running more than one? Urganize gives you a real rollout plan, tasks with owners, a press kit, and status in one place.",
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
    them: "The plan sits in a pinned message, a spreadsheet someone made once, and your head. Every new release starts from zero, plus whatever you remember from the last one.",
    us: "Create a release and Urganize lays out the whole 11-week rollout. 64 tasks, from locking the master to pulling your first-week numbers. Real managers wrote it, and you can change anything before you save it.",
  },
  {
    kicker: "Ownership",
    title: "Assigned, not announced.",
    them: "Work gets assigned in a chat message. “Did you see my text?” becomes the follow-up system. A message that gets scrolled past is a deadline nobody sees until it is missed.",
    us: "Every task has an owner, a due date, and a priority. Tasks wait for each other in the right order: a blocked task shows you exactly what it is waiting on, and unlocks the moment that is done.",
  },
  {
    kicker: "Press kit",
    title: "Sent as one link, not rebuilt every time.",
    them: "The press kit is a doc full of dead links. You rebuild it from scratch every time a curator or journalist asks.",
    us: "Urganize builds a press kit from your release: cover art, details, and photos. It updates itself when the release changes. Send one link. Turn it off anytime.",
  },
  {
    kicker: "Status",
    title: "Seen at a glance, not asked again.",
    them: "To find out where a release stands, you scroll back through weeks of chat. Or you ask someone to repeat what they already told you. Now do that for every release you run.",
    us: "One workspace shows every release you have going: progress, what's overdue, what's due this week. You stop needing a meeting to know the status.",
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
              really do work. Add a second release, a third artist, and a
              team passing work around. The system that got you here starts
              to drop things.
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
                you talk, and Drive is still where your raw files live.
                Urganize doesn&apos;t replace either one. It&apos;s the one
                place where the plan lives, the work happens, and the team
                sees status. The plan never has to live in a chat thread
                again.
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
                <ProofLine id="tamuno" className="mt-2" />
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>
      </main>

      <MarketingFooter />
    </div>
  );
}
