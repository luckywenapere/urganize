import type { Metadata } from "next";
import Link from "next/link";
import {
  PERSONA_HEADLINE_CLASS,
  PersonaValueBlocks,
} from "../components/landing/PersonaValueBlocks";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { WorkspaceShotSection } from "../components/landing/sections/WorkspaceShotSection";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { TESTIMONIALS } from "@/content/testimonials";

export const metadata: Metadata = buildPageMetadata({
  title: "Urganize for music executives",
  description:
    "Urganize is the AI workspace for music executives. Every release runs on the same plan, every activity has an owner and you see where all of them stand without chasing anyone.",
  path: "/for-executives",
});

// This is the persona page for the LOCKED positioning (founder brief,
// 2026-08-19): "Urganize is the AI workspace for music executives working
// with ambitious artists." Executives — label heads, A&R, VP Ops — are the
// buyer and the hero; /for-managers and /for-labels are the two adjacent
// entry points, not competing heroes. If the positioning ever moves, this
// page moves with it first.
//
// Same honesty rule as every other marketing page: every claim below
// describes the product as it ships today. Nothing here promises AI
// analysis, forecasting or an automatic report — the rollout planner's AI
// tailoring and the status generator are both flag-gated off in production,
// so this page describes the plan, ownership, press kit and status
// mechanics that work with or without a model. The metadata line above
// keeps the approved positioning wording (it mirrors LANDING_DESCRIPTION in
// lib/seo.ts) rather than inventing a new AI claim.
//
// Language rules from the same brief: no "system of record", no container
// metaphors ("one home", "lives in one place"), "workspace" is fine,
// fifth-grader readability, no Oxford comma in house copy.
const valueBlocks = [
  {
    kicker: "The plan",
    title: "Every release runs the same way, whoever runs it.",
    body: "Create a release and Urganize lays out the whole rollout. 64 activities across 11 weeks, from locking the master to pulling your first-week numbers. Your newest manager ships a release the same way your best one does, and anyone can edit or delete an activity that does not apply.",
    points: [
      "One template, shaped for each release",
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
    body: "One workspace shows every release you have going: progress, what is overdue and what is due this week. You stop booking a call just to find out where things stand.",
  },
  {
    kicker: "Press kit",
    title: "One link per release, ready before anyone asks.",
    body: "Urganize builds a press kit from the release and keeps it current when the release changes. Send the same link to press, curators and bookers.",
  },
] as const;

export default function ForExecutivesPage() {
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
              For music executives
            </p>
            {/* The hero line is the OG card's baked tagline (see
                SHARE_IMAGE in lib/seo.ts). Same words on the card and on
                the executive page on purpose. */}
            <h1 className="mt-8 text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem]">
              Every artist. Every release.{" "}
              <span className="italic text-[var(--marketing-accent)]">
                On plan.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              You answer for releases you did not personally run. The plan
              sits in someone else&apos;s head, the status sits in someone
              else&apos;s chat and you find out a date slipped after it
              slipped. Urganize gives every release the same plan and shows
              you all of them at once.
            </p>
            <div className="mt-8 flex w-full flex-col items-center gap-3">
              <WaitlistForm source="for_executives_hero" />
            </div>
          </div>
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
                See every release without asking.
              </h2>
              <p className="mx-auto mt-6 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
                Start with a 14-day free trial, and we set up every team
                personally. See{" "}
                <Link
                  href="/pricing"
                  className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
                >
                  how that works
                </Link>
                .
              </p>
              <div className="mt-10 flex w-full flex-col items-center gap-3">
                <WaitlistForm source="for_executives_cta" />
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
            Running a roster with your own team?{" "}
            <Link
              href="/for-labels"
              className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
            >
              See Urganize for labels
            </Link>
            . Running the releases yourself?{" "}
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
