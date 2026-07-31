import type { Metadata } from "next";
import Link from "next/link";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { TESTIMONIALS } from "@/content/testimonials";

export const metadata: Metadata = buildPageMetadata({
  title: "Urganize for artist managers",
  description:
    "Urganize is built for artist managers running more than one release at once. A rollout plan, tasks with owners, a press kit, and status in one place.",
  path: "/for-managers",
});

// Same honesty rule as /features and /why-urganize: every claim below
// describes the product as it ships today. No AI-guidance framing (the
// rollout planner's AI tailoring and the status generator are flag-gated
// off in production pending model activation) — this page describes the
// template, task, file, and status mechanics underneath them.
const valueBlocks = [
  {
    kicker: "The plan",
    title: "You don't start from a blank page for artist number three.",
    body: "Create a release and Urganize lays out the whole rollout. 64 tasks across 11 weeks, from locking the master to pulling your first-week numbers. Every artist gets the same starting plan, and you can change anything before you save it.",
    points: [
      "One template, shaped for each release",
      "Every task dated around that release day",
      "Edit, reorder, or delete anything before you save it",
    ],
  },
  {
    kicker: "Ownership",
    title: "Hand work off without babysitting it.",
    body: "Every task has an owner, a due date, and a priority. Assign your PR, designer, or distributor directly. Tasks wait for each other in the right order, so nothing starts before the step it needs is done.",
    points: [
      "Assign anyone on your team to any task",
      "Blocked tasks show exactly what's blocking them",
      "A blocked task unlocks the moment the step before it is done",
    ],
  },
  {
    kicker: "Press kit",
    title: "One link, ready whenever press asks.",
    body: "Urganize builds a press kit from the release: cover art, details, and photos. It updates itself when the release changes. Send one link to press, curators, and bookers, for any artist you run.",
    points: [
      "Built for you from the release",
      "Always up to date. No rebuilding by hand",
      "One link. Turn it off anytime",
    ],
  },
  {
    kicker: "Status",
    title: "Answer \"where's that release?\" without scrolling WhatsApp.",
    body: "One workspace shows every release you run: progress, what's overdue, what's due this week, and which artist it belongs to. Click a release to see just its work.",
    points: [
      "Every release and task on one screen",
      "Overdue and due-today shown first",
      "See one release on its own when that's all you need",
    ],
  },
] as const;

const headlineClass =
  "text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[3.6rem]";

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
              Every artist&apos;s release.{" "}
              <span className="italic text-[var(--marketing-accent)]">
                One screen, not five chats.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              One artist and one release? A group chat and a Drive folder hold
              up fine. Add a second release, a third artist, and a team, and
              keeping it all moving becomes the real job. Urganize is built
              for that part.
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

        {/* TESTIMONIAL — Antoine's quote, verbatim, signed off 2026-07-06.
            Never edit a quote after sign-off without re-approval. Sourced
            from content/testimonials.ts — the single canonical copy; the
            same words also appear as one of the TransformationSection rows
            on the landing page. Swapped off Adenaiye 2026-07-31 when her
            quote (about file storage) was retired from display; Antoine's
            plan-already-laid-out story fits a manager audience directly. */}
        <ScrollReveal>
          <SectionShell
            className="py-[80px] lg:py-[100px]"
            containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="border-t border-[color:var(--marketing-border)] pt-14 text-center">
              <blockquote className="text-balance text-[1.4rem] font-medium leading-[1.5] tracking-[-0.02em] text-[var(--marketing-text)] sm:text-[1.7rem]">
                &ldquo;{TESTIMONIALS.antoine.quote}&rdquo;
              </blockquote>
              <p className="mono-label mt-6 text-[var(--marketing-text-subtle)]">
                {TESTIMONIALS.antoine.name}, {TESTIMONIALS.antoine.role}
              </p>
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* FINAL CTA */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={headlineClass}>Run every release with a system.</h2>
              <p className="mx-auto mt-6 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
                Urganize is free to use right now, and we set up every team
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
                <WaitlistForm source="for_managers_cta" />
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
            Running a bigger roster with your own team?{" "}
            <Link
              href="/for-labels"
              className="text-[var(--marketing-text)] underline underline-offset-4 hover:text-[var(--marketing-accent)]"
            >
              See Urganize for labels
            </Link>
            .
          </p>
        </SectionShell>
      </main>

      <MarketingFooter />
    </div>
  );
}
