import type { Metadata } from "next";
import Link from "next/link";
import {
  PERSONA_HEADLINE_CLASS,
  PersonaValueBlocks,
} from "../components/landing/PersonaValueBlocks";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { TrialButton } from "../components/landing/TrialButton";
import { WorkspaceShotSection } from "../components/landing/sections/WorkspaceShotSection";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { TESTIMONIALS } from "@/content/testimonials";

export const metadata: Metadata = buildPageMetadata({
  title: "Release planning software for artist managers",
  description:
    "Every release, on plan, for artist managers running more than one artist. Add a release, get the plan and your team knows what to do and when.",
  path: "/for-managers",
});

// Same honesty rule as /features and /why-urganize: every claim below
// describes the product as it ships today. No AI-guidance framing (the
// rollout planner's AI tailoring and the status generator are flag-gated
// off in production pending model activation) — this page describes the
// template, task, file, and status mechanics underneath them.
//
// 2026-08-05 (URG-218): same conversion fix as /why-urganize. This page
// had no CTA until the very bottom (~6 screens down), four identical
// kicker/title/body/bullets blocks in a row, and not a single product
// screenshot anywhere. Fixed by: a CTA in the hero, "The plan" kept as
// the one full-size block with the workspace screenshot right after it,
// and the other three folded into one compact section. Keep it that way.
const valueBlocks = [
  {
    kicker: "The plan",
    title: "You don't start from a blank page for artist number three.",
    body: "Create a rollout and Urganize lays out the whole plan, sized to the format: 64 activities for a single, 90 for an EP, 113 for an album. Every artist gets the same starting plan and you can edit or delete any activity.",
    points: [
      "One template, shaped for each rollout",
      "Every activity dated around that release day",
      // Never "reorder" — reordering has no UI (CLAUDE.md: the endpoint
      // was deleted 2026-07-10) and the honesty rule bans advertising it.
      "Edit or delete anything. It's your plan",
    ],
  },
] as const;

// Folded from three full-size blocks into one compact section (see the
// note above). One sentence per side, tightened from the previously
// approved block copy — same claims, less scroll.
const compactBlocks = [
  {
    kicker: "Ownership",
    title: "Hand work off without babysitting it.",
    body: "Every activity has an owner, a due date and a priority. Nothing starts before the step it needs is done.",
  },
  {
    kicker: "Press kit",
    title: "One link, ready whenever press asks.",
    body: "Urganize builds each artist a press kit from the work you already put in, and tells you when a new rollout is missing from it. It works the same for any artist you run.",
  },
  {
    kicker: "Status",
    title: "Answer \"where's that rollout?\" without scrolling WhatsApp.",
    body: "One list shows every rollout you run: progress, what's overdue, what's due this week and which artist it belongs to.",
  },
] as const;

export default function ForManagersPage() {
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
              For artist managers
            </p>
            <h1 className="mt-8 text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem]">
              Every artist&apos;s rollout.{" "}
              <span className="italic text-[var(--marketing-accent)]">
                One screen, not five chats.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              One artist and one rollout? A group chat and a Drive folder hold
              up fine. Add a second rollout, a third artist and a team, and
              keeping it all moving becomes the real job. Urganize is built
              for that part.
            </p>
            {/* CTA moved into the hero (2026-08-05, URG-218): the page
                previously had no ask until the very bottom, ~6 screens
                down, so anyone who stopped reading early never saw one.
                No ProofLine here (Antoine's full quote already sits above
                the final CTA — see the mount table note in ProofLine.tsx
                about not stacking two testimonials on one page's CTAs). */}
            {/* Since the 2026-09-02 homepage overhaul the ask is the free
                trial, the same TrialButton the homepage mounts; the waitlist
                survives as a disclosure under the final CTA. */}
            <div className="mt-8 flex w-full flex-col items-center gap-4">
              <TrialButton location="for_managers_hero" size="lg" className="w-full sm:w-auto" />
              <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
                We are letting teams in from the waitlist.
              </p>
            </div>
          </div>
        </SectionShell>

        {/* VALUE BLOCKS */}
        <PersonaValueBlocks blocks={valueBlocks} />

        {/* PRODUCT PROOF (2026-08-05, URG-218) — this page had zero product
            imagery; reuses the homepage's screenshot section verbatim so a
            manager sees the multi-release catalog the copy is describing. */}
        <WorkspaceShotSection />

        {/* THE REST, COMPACTED (2026-08-05, URG-218) — was three more
            full-size boxed blocks (Ownership, Press kit, Status); folded
            into one section, one sentence each. See the valueBlocks
            comment. */}
        <ScrollReveal>
          <SectionShell
            className="py-[60px] lg:py-[80px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[64rem] border-t border-[color:var(--marketing-border)] pt-14">
              <p className="mono-label text-[var(--marketing-accent)]">
                Everything else
              </p>
              <h2 className={`mt-5 max-w-[40rem] ${PERSONA_HEADLINE_CLASS}`}>
                Hand-offs, the press kit and status come with it.
              </h2>

              <div className="mt-10 divide-y divide-[color:var(--marketing-border)]">
                {compactBlocks.map((item) => (
                  <div key={item.kicker} className="py-6">
                    <p className="mono-label text-[var(--marketing-text-subtle)]">
                      {item.kicker}
                    </p>
                    <p className="mt-3 max-w-[52rem] text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                      <span className="font-medium text-[var(--marketing-text)]">
                        {item.title}
                      </span>{" "}
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* TESTIMONIAL — Adenaiye's quote, verbatim, signed off 2026-08-05
            (URG-220). Never edit a quote after sign-off without
            re-approval. Sourced from content/testimonials.ts — the single
            canonical copy. Swapped in 2026-08-05: her new review's chaos/
            multiple-releases-and-artists-and-team sentence is this page's
            exact audience. Antoine (the prior quote here) still carries the
            /features CTA ProofLine (his landing TransformationSection row
            went with that section, removed 2026-08-25), so his voice isn't
            lost from the site. */}
        <ScrollReveal>
          <SectionShell
            className="py-[80px] lg:py-[100px]"
            containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="border-t border-[color:var(--marketing-border)] pt-14 text-center">
              <blockquote className="text-balance text-[1.4rem] font-medium leading-[1.5] tracking-[-0.02em] text-[var(--marketing-text)] sm:text-[1.7rem]">
                &ldquo;{TESTIMONIALS.adenaiye.quote}&rdquo;
              </blockquote>
              <p className="mono-label mt-6 text-[var(--marketing-text-subtle)]">
                {TESTIMONIALS.adenaiye.name}, {TESTIMONIALS.adenaiye.role}
              </p>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* FINAL CTA */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={PERSONA_HEADLINE_CLASS}>Run every rollout with a system.</h2>
              <p className="mx-auto mt-6 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
                Join the waitlist, and we set up every team
                personally. See{" "}
                <Link
                  href="/pricing"
                  className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
                >
                  how that works
                </Link>
                .
              </p>
              <div className="mt-10 flex w-full flex-col items-center gap-4">
                <TrialButton location="for_managers_cta" size="lg" className="w-full sm:w-auto" />
                <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
                  We are letting teams in from the waitlist.
                </p>
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* CROSS-LINK */}
        <SectionShell
          className="pb-20 pt-0"
          containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
        >
          <p className="text-center text-sm text-[var(--marketing-text-subtle)]">
            Answering for rollouts other people run?{" "}
            <Link
              href="/for-executives"
              className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
            >
              See Urganize for executives
            </Link>
            .
          </p>
        </SectionShell>
      </main>

      <MarketingFooter />
    </div>
  );
}
