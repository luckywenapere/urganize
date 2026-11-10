import type { Metadata } from "next";
import Link from "next/link";
import {
  PERSONA_HEADLINE_CLASS,
  PersonaValueBlocks,
} from "../components/landing/PersonaValueBlocks";
import { ResponsiveProductShot } from "../components/landing/ResponsiveProductShot";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { TrialButton } from "../components/landing/TrialButton";
import { WorkspaceShotSection } from "../components/landing/sections/WorkspaceShotSection";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { TESTIMONIALS } from "@/content/testimonials";
import { PageDawn } from "../components/marketing/PageDawn";
import type { ProductShot } from "@/content/product-shots";
import { PRIMARY_CTA } from "@/lib/app-urls";

export const metadata: Metadata = buildPageMetadata({
  title: "Release planning software for artist managers",
  description:
    "For artist managers. Urganize asks about each artist's goals, makes a plan that fits and keeps track of every task.",
  path: "/for-managers",
  shareCard: "for-managers",
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
    body: "Urganize starts from what each artist wants and makes a plan that fits: 64 tasks for a single, 90 for an EP, 113 for an album. Or make your own, and edit or delete any task.",
    points: [
      "A plan shaped to your goals, or your own",
      "Every task dated back from that drop day",
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
    title: "Every job has a name on it.",
    body: "Every task has an owner, a due date and a priority. Nothing starts before the step it needs is done.",
  },
  {
    kicker: "Feedback",
    title: "See what worked.",
    body: "After every task, Urganize asks how it went, so you can see what worked for each artist when the release is out.",
  },
  {
    kicker: "Press kit",
    title: "One link, ready whenever press asks.",
    body: "Each artist gets a press kit with its own link, and it goes along with every pitch you send to a curator.",
  },
  {
    kicker: "Status",
    title: "Answer \u201cwhere are we on that release?\u201d without scrolling WhatsApp.",
    body: "One list shows every release you run: progress, what\u2019s overdue, what\u2019s due this week and which artist it belongs to.",
  },
] as const;

// The manager's-week still (#957, mock approved by the founder 2026-11-01).
// A drawn picture, not a capture: the Artists page with its due and late
// pills, and one teammate's card (the Team person panel) in front. Made-up
// artists, drawn in the app's light and neutral dark tokens so it follows the
// site's theme toggle. The ground around the window is transparent (filmed on
// white and on black and matted), so the hero's glow shows through it. If the Artists page or the person panel changes,
// redraw both.
const managerWeek: ProductShot = {
  light: "/images/product/manager-week.webp",
  dark: "/images/product/manager-week-dark.webp",
  width: 1920,
  height: 1040,
};
const managerWeekPhone: ProductShot = {
  light: "/images/product/manager-week-phone.webp",
  dark: "/images/product/manager-week-phone-dark.webp",
  width: 716,
  height: 1000,
};

export default function ForManagersPage() {
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
              For artist managers
            </p>
            <h1 className="mt-8 text-balance text-[2.25rem] leading-[1.06] text-[var(--marketing-text)] sm:text-[3.6rem]">
              Every artist&rsquo;s release.{" "}
              <span className="text-[var(--marketing-accent)]">
                One screen, not five chats.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              One artist or five, the plan and the tasks live in one place,
              not in five chats. Urganize keeps track of every task, so
              chasing everyone stops being your job.
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
                {PRIMARY_CTA.note}
              </p>
            </div>
          </PageDawn>
        </SectionShell>

        {/* THE WEEK: the approved manager's-week still, right under the
            hero so "One screen, not five chats" has its picture. Phone
            picture below sm, the wide one from sm up (ResponsiveProductShot
            picks one). */}
        <SectionShell
          className="pb-8 pt-0 sm:pb-12 sm:pt-0 lg:pb-16 lg:pt-0"
          containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10"
        >
          <div className="mx-auto max-w-[24rem] sm:max-w-none">
            <ResponsiveProductShot
              desktop={managerWeek}
              phone={managerWeekPhone}
              alt="The Urganize Artists page: Kanmi Gold has 2 tasks due and 1 late, Hadiza Moon has 4 due. A card in front shows teammate Tobi Adeyemi: Final cover art for Kanmi Gold is late, Send press photos for Hadiza Moon is due Thursday."
              sizes="(min-width: 1024px) 944px, calc(100vw - 64px)"
              fetchPriority="auto"
            />
          </div>
        </SectionShell>

        {/* VALUE BLOCKS */}
        <PersonaValueBlocks blocks={valueBlocks} />

        {/* PRODUCT PROOF (2026-08-05, URG-218) — this page had zero product
            imagery then (the manager's-week still under the hero came on
            2026-11-01, #957); reuses the homepage's screenshot section verbatim so a
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
                Hand it off and stop babysitting it.
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
              <h2 className={PERSONA_HEADLINE_CLASS}>Stop chasing your whole roster.</h2>
              <p className="mx-auto mt-6 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
                Start free, and move to a paid plan when you need more. See{" "}
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
                  {PRIMARY_CTA.note}
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
            Answering for releases other people run?{" "}
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
