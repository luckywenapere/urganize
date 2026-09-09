import type { Metadata } from "next";
import Link from "next/link";
import {
  PERSONA_HEADLINE_CLASS,
  PersonaValueBlocks,
} from "../components/landing/PersonaValueBlocks";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { PRODUCT_CATEGORY } from "@/lib/positioning";
import { buildPageMetadata } from "@/lib/seo";
import { SALES_CONTACT_EMAIL } from "@urganize/pricing";

export const metadata: Metadata = buildPageMetadata({
  title: "For labels",
  description:
    `An ${PRODUCT_CATEGORY} for labels and management companies running a roster. The founders set you up, templates match how your label works and every rollout runs the same way.`,
  path: "/for-labels",
});

// Same honesty rule as every other marketing page: every claim below
// describes the product as it ships today. Deliberately does NOT claim a
// self-serve multi-artist-in-one-workspace feature — that's a real UI
// limit right now (schema allows more, the UI doesn't yet). What the Label
// tier actually is: the same one-artist workspace as everyone else, plus
// founder-delivered service across a roster of them. See LABEL_FEATURES in
// PricingPageClient.tsx for the source of truth on that benefit list.
const valueBlocks = [
  {
    kicker: "The plan",
    title: "Every artist's rollout, the same system.",
    body: "Each rollout gets the full plan, sized to the format: 64 activities for a single, 90 for an EP, 113 for an album. Run it the same way for every artist on the roster and edit or delete any activity.",
    points: [
      "One template, shaped for each rollout",
      "Every activity dated around that release day",
      "The same for every artist you work with",
    ],
  },
  {
    kicker: "Ownership",
    title: "Assign across a bigger team without losing track.",
    body: "Every activity has an owner, a due date and a priority. A roster has a lot of moving parts, so activities wait for each other in the right order. Nothing starts before the step it needs is done.",
    points: [
      "Assign anyone on your team to any activity",
      "Blocked activities show exactly what's blocking them",
      "A blocked activity unlocks the moment the step before it is done",
    ],
  },
  {
    kicker: "Press kit",
    title: "One link per rollout, across the whole roster.",
    body: "Urganize builds each artist a press kit from the work you already put in: bio, photos, credits, shows. When a new rollout lands it tells you what is missing and you take the parts you want. One link for press, curators and bookers, and it works the same for every artist.",
    points: [
      "Built for you from the rollout",
      "Always up to date. No rebuilding by hand",
      "The same system for every rollout on the roster",
    ],
  },
  {
    kicker: "Status",
    title: "See the whole roster's status without asking.",
    body: "One list shows every rollout you have going: progress, what's overdue, what's due this week. You stop needing a meeting just to share status.",
    points: [
      "Every rollout and activity in one place",
      "Overdue and due-today shown first",
      "See one rollout on its own when that's all you need",
    ],
  },
] as const;

// Verbatim from PricingPageClient.tsx's LABEL_FEATURES — the already-
// approved, already-shipped description of what the Label tier delivers.
// Kept in sync manually since the pricing page owns billing-adjacent copy
// and this page owns persona framing; if the benefit list changes there,
// update it here too.
const labelBenefits = [
  "Roster set-up: we set up every artist's rollouts with you",
  "Rollout templates shaped to how your label actually works",
  "Hands-on set-up for your whole team",
  "Priority support with a direct line to the founders",
] as const;

export default function ForLabelsPage() {
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
              For labels
            </p>
            <h1 className="mt-8 text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem]">
              A roster is a lot of rollouts at once.{" "}
              <span className="italic text-[var(--marketing-accent)]">
                Urganize is built for that.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              A roster means many calendars, many rollouts moving at
              once and a pile of chats holding it all together.
              Urganize gives every rollout the same system, and the founders
              help you set it up.
            </p>
          </div>
        </SectionShell>

        {/* VALUE BLOCKS */}
        <PersonaValueBlocks blocks={valueBlocks} />

        {/* WHAT THE LABEL TIER ACTUALLY GETS YOU — the honesty/clarity
            block. Replaces /why-urganize's "Keep WhatsApp, keep Drive"
            block with the equivalent guardrail for this audience: be clear
            about what's a founder service versus a self-serve UI feature. */}
        <ScrollReveal>
          <SectionShell
            className="py-[100px] lg:py-[120px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[52rem] text-center">
              <p className="mono-label text-[var(--marketing-text-subtle)]">
                To be clear
              </p>
              <h2 className={`mt-6 ${PERSONA_HEADLINE_CLASS}`}>
                What the Label plan actually gets you.
              </h2>
              {/* CORRECTED 2026-09-01. This said "one artist at a time", which
                  was honest when it was written and became false on 2026-08-30
                  when rosters shipped: a team holds as many artists as its tier
                  allows, and Label's ceiling is none. It was also the worst
                  place in the site to be wrong — telling the tier that pays for
                  a roster that it gets one artist, while /pricing offered the
                  same tier "Unlimited artists" a click away.

                  The block still does its original job, which is to separate a
                  founder SERVICE from a self-serve FEATURE. That distinction is
                  the reason this section exists; only the factual half moved. */}
              <p className="mx-auto mt-6 max-w-[38rem] text-balance text-base leading-8 text-[var(--marketing-text-muted)]">
                You get the same product as everyone else, with your whole
                roster in it. The founders also work with you directly across it.
              </p>
            </div>

            <div className="mx-auto mt-14 grid max-w-[60rem] grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2">
              {labelBenefits.map((benefit) => (
                <div
                  key={benefit}
                  className="bg-[var(--marketing-bg)] px-6 py-7 text-left sm:px-7 sm:py-8"
                >
                  <p className="text-[0.95rem] leading-7 text-[var(--marketing-text)]">
                    {benefit}
                  </p>
                </div>
              ))}
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* FINAL CTA. The Label plan STOPPED being sales-led on 2026-09-08:
            it carries a ₦50,000/year price and a card checkout again, so this
            page no longer says we price each roster deal by hand. What survives
            is the offer that was always the real substance of Label and is not
            self-serve at all: the founders set the roster up with you. There is
            no contactSales tier anywhere in the product any more — Group briefly
            filled that slot and was removed 2026-09-09 — so "Talk to the
            founders" below is a parallel path on Label itself, not a pointer at
            a separate tier. */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={PERSONA_HEADLINE_CLASS}>Set up your roster with the founders.</h2>
              <p className="mx-auto mt-6 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
                Start on the Label plan and we will sit down with you to get
                your whole roster in. Talk to us first if you would rather, or
                see{" "}
                <Link
                  href="/pricing"
                  className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
                >
                  full pricing
                </Link>
                .
              </p>
              <div className="mt-10 flex w-full flex-col items-center gap-3">
                <a
                  href={`mailto:${SALES_CONTACT_EMAIL}?subject=${encodeURIComponent("Urganize Label plan enquiry")}`}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--marketing-primary)] px-6 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_12px_32px_var(--marketing-shadow-strong)] hover:bg-[var(--marketing-primary-hover)]"
                >
                  Talk to the founders
                </a>
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
            Running one artist&apos;s rollouts yourself?{" "}
            <Link
              href="/for-managers"
              className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
            >
              See Urganize for managers
            </Link>
            . Answering for rollouts other people run?{" "}
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
