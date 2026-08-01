import type { Metadata } from "next";
import Link from "next/link";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { SALES_CONTACT_EMAIL } from "@urganize/pricing";

export const metadata: Metadata = buildPageMetadata({
  title: "Urganize for labels",
  description:
    "Urganize for labels and management companies running a roster. The founders set you up, templates match how your label works, and every release lives in one system.",
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
    body: "Each release gets the full rollout: 64 activities across 11 weeks, from locking the master to pulling your first-week numbers. Run it the same way for every artist on the roster, and change anything before you save it.",
    points: [
      "One template, shaped for each release",
      "Every activity dated around that release day",
      "The same for every artist you work with",
    ],
  },
  {
    kicker: "Ownership",
    title: "Assign across a bigger team without losing track.",
    body: "Every activity has an owner, a due date, and a priority. A roster has a lot of moving parts, so activities wait for each other in the right order. Nothing starts before the step it needs is done.",
    points: [
      "Assign anyone on your team to any activity",
      "Blocked activities show exactly what's blocking them",
      "A blocked activity unlocks the moment the step before it is done",
    ],
  },
  {
    kicker: "Press kit",
    title: "One link per release, across the whole roster.",
    body: "Urganize builds a press kit from any release: cover art, details, and photos. It updates itself when the release changes. Send one link to press, curators, and bookers. It works the same for every artist.",
    points: [
      "Built for you from the release",
      "Always up to date. No rebuilding by hand",
      "The same system for every release on the roster",
    ],
  },
  {
    kicker: "Status",
    title: "See the whole roster's status without asking.",
    body: "One workspace shows every release you have going: progress, what's overdue, what's due this week. You stop needing a meeting just to share status.",
    points: [
      "Every release and activity in one place",
      "Overdue and due-today shown first",
      "See one release on its own when that's all you need",
    ],
  },
] as const;

// Verbatim from PricingPageClient.tsx's LABEL_FEATURES — the already-
// approved, already-shipped description of what the Label tier delivers.
// Kept in sync manually since the pricing page owns billing-adjacent copy
// and this page owns persona framing; if the benefit list changes there,
// update it here too.
const labelBenefits = [
  "Roster set-up: we set up every artist's releases with you",
  "Release templates shaped to how your label actually works",
  "Hands-on set-up for your whole team",
  "Priority support with a direct line to the founders",
] as const;

const headlineClass =
  "text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[3.6rem]";

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
              A roster is a lot of releases at once.{" "}
              <span className="italic text-[var(--marketing-accent)]">
                Urganize is built for that.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              A roster means many release calendars, many rollouts moving at
              once, and a pile of chats holding it all together.
              Urganize gives every release the same system, and the founders
              help you set it up.
            </p>
          </div>
        </SectionShell>

        {/* VALUE BLOCKS */}
        {valueBlocks.map((block, index) => (
          <ScrollReveal key={block.title}>
            <SectionShell
              className="py-[60px] lg:py-[80px]"
              containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
            >
              <div
                className={`mx-auto grid max-w-[64rem] items-start gap-10 border-t border-[color:var(--marketing-border)] pt-14 lg:grid-cols-2 lg:gap-16 ${
                  index % 2 === 1 ? "lg:[&>div:first-child]:order-2" : ""
                }`}
              >
                <div>
                  <p className="mono-label text-[var(--marketing-accent)]">
                    {block.kicker}
                  </p>
                  <h2 className={`mt-5 ${headlineClass}`}>{block.title}</h2>
                </div>
                <div>
                  <p className="text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
                    {block.body}
                  </p>
                  <ul className="mt-7 space-y-3">
                    {block.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-baseline gap-4 text-[0.95rem] leading-7 text-[var(--marketing-text)]"
                      >
                        <span
                          className="font-mono text-[0.72rem] text-[var(--marketing-accent)]"
                          aria-hidden
                        >
                          —
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </SectionShell>
          </ScrollReveal>
        ))}

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
              <h2 className={`mt-6 ${headlineClass}`}>
                What the Label plan actually gets you.
              </h2>
              <p className="mx-auto mt-6 max-w-[38rem] text-balance text-base leading-8 text-[var(--marketing-text-muted)]">
                You get the same workspace as everyone else, one artist at a
                time. The founders also work with you directly across your
                roster.
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

        {/* FINAL CTA — sales-led, not self-serve. The Label plan is
            contactSales in @urganize/pricing: no price, no waitlist form,
            a mailto straight to the founders, identical href construction
            to the Label PricingTierCard on /pricing. */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={headlineClass}>Set up your roster with the founders.</h2>
              <p className="mx-auto mt-6 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
                We shape and price each roster deal with you. Talk to us
                directly, or see{" "}
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
            Running one artist&apos;s releases yourself?{" "}
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
