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
import { PageDawn } from "../components/marketing/PageDawn";

export const metadata: Metadata = buildPageMetadata({
  title: "Release planning for teams running a roster",
  description:
    "Every release, on plan, across your whole roster. Each release gets the same plan, every activity has an owner and you see where they all stand without chasing anyone.",
  path: "/for-executives",
});

// This is the persona page for the team running a roster. It was written for
// the 2026-08-19 positioning, which made executives the hero and is now
// superseded: the 2026-09-09 brief puts artists first in the audience and
// retires the job titles that brief used to name this reader. So the page
// keeps its route (a live URL is not a copy decision) and speaks to the WORK
// of running several artists rather than to a title. /for-managers is the
// adjacent entry point, not a competing hero (/for-labels was the other until
// it was removed on 2026-09-11; its URL now redirects to /pricing).
//
// Same honesty rule as every other marketing page: every claim below
// describes the product as it ships today. Nothing here promises AI
// analysis, forecasting or an automatic report — the rollout planner's AI
// tailoring and the status generator are both flag-gated off in production,
// so this page describes the plan, ownership, press kit and status
// mechanics that work with or without a model. The metadata line above
// keeps the approved positioning wording ("Every release, on plan.", the
// 2026-10-17 line; "everything after the music" before it) rather than
// inventing a new AI claim.
//
// Language rules (2026-09-09): never "workspace", never "ship", no "system
// of record", fifth-grader readability, no Oxford comma in house copy. The
// earlier ban on container metaphors is the one rule that flipped, since
// "from one place" is now the product's own promise.
const valueBlocks = [
  {
    kicker: "The plan",
    title: "Every rollout runs the same way, whoever runs it.",
    body: "Create a rollout and Urganize lays out the whole plan, sized to the format: 64 activities for a single, 90 for an EP, 113 for an album. Your newest manager delivers a rollout the same way your best one does, and anyone can edit or delete an activity that does not apply.",
    points: [
      "One template, shaped for each rollout",
      "Every activity dated around that release day",
      "The same starting plan for every artist and every team",
    ],
  },
] as const;

const compactBlocks = [
  {
    kicker: "Accountability",
    title: "Every activity has a name on it.",
    body: "An owner, a due date and a priority. Activities wait for each other in the right order, so nothing starts before the step it needs is done and nobody has to remember the sequence.",
  },
  {
    kicker: "Status",
    title: "Walk into the meeting already knowing.",
    body: "One list shows every rollout you have going: progress, what is overdue and what is due this week. You stop booking a call just to find out where things stand.",
  },
  {
    kicker: "Press kit",
    title: "One link per rollout, ready before anyone asks.",
    body: "Urganize builds each artist a press kit from the work you already put in, and tells you when a new rollout is missing from it. One link for press, curators and bookers, and it stays the same link.",
  },
] as const;

export default function ForExecutivesPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--marketing-bg)] text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)] selection:text-[var(--marketing-text)]">
      <MarketingHeader />

      <main className="isolate overflow-x-clip">
        {/* HERO */}
        <SectionShell
          className="pb-16 pt-16 sm:pt-20"
          containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10"
        >
          <PageDawn className="mx-auto max-w-[46rem] text-center">
            <p className="mono-label text-[var(--marketing-text-subtle)]">
              For roster teams
            </p>
            {/* The hero line is the OG card's baked tagline (see
                SHARE_IMAGE in lib/seo.ts). Same words on the card and on
                the executive page on purpose. */}
            <h1 className="mt-8 text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem]">
              Every artist. Every rollout.{" "}
              <span className="italic text-[var(--marketing-accent)]">
                On plan.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              You answer for rollouts you did not personally run. The plan
              sits in someone else&apos;s head, the status sits in someone
              else&apos;s chat and you find out a date slipped after it
              slipped. Urganize gives every rollout the same plan and shows
              you all of them at once.
            </p>
            {/* Since the 2026-09-02 homepage overhaul the ask is the free
                trial, the same TrialButton the homepage mounts; the waitlist
                survives as a disclosure under the final CTA. */}
            <div className="mt-8 flex w-full flex-col items-center gap-4">
              <TrialButton location="for_executives_hero" size="lg" className="w-full sm:w-auto" />
              <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
                We are letting teams in from the waitlist.
              </p>
            </div>
          </PageDawn>
        </SectionShell>

        {/* VALUE BLOCKS */}
        <PersonaValueBlocks blocks={valueBlocks} />

        {/* PRODUCT PROOF — the real workspace screenshots, same section the
            homepage and /for-managers use. Marketing screenshots must show
            the current app (CLAUDE.md); this is the only current one. */}
        <WorkspaceShotSection />

        {/* THE REST, COMPACTED — same shape as /for-managers: one section,
            one sentence per beat, instead of three more full-size blocks. */}
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
                Ownership, status and the press kit come with it.
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

        {/* TESTIMONIAL — Tamuno-Tekena, the site's one A&R voice, so the
            quote comes from this page's actual audience. Verbatim, signed
            off 2026-07-06; never edit or truncate it (see
            content/testimonials.ts). His words also anchor the
            /why-urganize CTA ProofLine, which is a different page — what
            ProofLine.tsx's mount table warns against is stacking TWO
            testimonials on one page's CTA, which is why there is no
            ProofLine under the form below. */}
        <ScrollReveal>
          <SectionShell
            className="py-[80px] lg:py-[100px]"
            containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="border-t border-[color:var(--marketing-border)] pt-14 text-center">
              <blockquote className="text-balance text-[1.4rem] font-medium leading-[1.5] tracking-[-0.02em] text-[var(--marketing-text)] sm:text-[1.7rem]">
                &ldquo;{TESTIMONIALS.tamuno.quote}&rdquo;
              </blockquote>
              <p className="mono-label mt-6 text-[var(--marketing-text-subtle)]">
                {TESTIMONIALS.tamuno.name}, {TESTIMONIALS.tamuno.role}
              </p>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* FINAL CTA */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={PERSONA_HEADLINE_CLASS}>
                See every rollout without asking.
              </h2>
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
                <TrialButton location="for_executives_cta" size="lg" className="w-full sm:w-auto" />
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
            Running the rollouts yourself?{" "}
            <Link
              href="/for-managers"
              className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
            >
              See Urganize for managers
            </Link>
            .
          </p>
        </SectionShell>
      </main>

      <MarketingFooter />
    </div>
  );
}
