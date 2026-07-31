import type { Metadata } from "next";
import Image from "next/image";
import { ProofLine } from "../components/landing/ProofLine";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Features",
  description:
    "What Urganize does: a rollout plan for every release, tasks your team owns, a press kit you can send as one link, and Chappi, the assistant in your workspace.",
  path: "/features",
});

// Every claim on this page must describe the product as it ships today.
// The honesty rule from /pricing applies here: we don't advertise what
// isn't built (no credits, no pre-save, no stages). The Assistant block
// below describes Chappi's live deterministic commands only — no
// conversational-AI framing until a capable model is actually wired.
const features = [
  {
    kicker: "The plan",
    title: "A rollout plan, not a blank page.",
    body: "Create a release and Urganize lays out the whole 11-week rollout. 64 tasks, from locking the master to pulling your first-week numbers. Real managers wrote it and tested it. Change anything before you save it.",
    points: [
      "8 weeks before the drop, 3 weeks after",
      "Every task dated around your release day",
      "Edit, reorder, or delete anything. It's your plan",
    ],
    // Real screenshot of the current release view (retaken 2026-07-25).
    // Same house rule as the landing page: if the UI changes meaningfully,
    // retake this — marketing imagery never lags the product.
    image: {
      src: "/images/product/workspace-tasks.png",
      alt: "A release open in Urganize: the progress bar at 1 of 64, and the full 64-task rollout plan with owners and due dates on every row.",
    },
  },
  {
    kicker: "Tasks",
    title: "Owned, dated, and in order.",
    body: "Every task has an owner, a due date, and a priority. Tasks wait for each other in the right order: the artwork upload stays locked until the artwork is approved. The moment it is, it unlocks.",
    points: [
      "Assign your A&R, PR, designer, distributor",
      "Blocked tasks show exactly what's blocking them",
      "Check things off from the release page or your own list",
    ],
  },
  {
    kicker: "Press kit",
    title: "One link, ready to send.",
    body: "Urganize builds a press kit from your release: cover art, details, and photos. It updates itself when the release changes. Send one link to press, curators, and bookers. Turn the link off anytime.",
    points: [
      "Built for you from the release",
      "Always up to date. No rebuilding by hand",
      "One link. Turn it off anytime",
    ],
  },
  {
    kicker: "Assistant",
    title: "Chappi handles the small stuff.",
    body: "Chappi is the assistant built into your workspace. Tell it what you need. Create a release. Add a task. Mark something done. Type it and it happens, with no menus to hunt through.",
    points: [
      "Create releases and tasks by typing what you want",
      "Built into the workspace, not a separate app",
      "It keeps getting better",
    ],
  },
  {
    kicker: "Milestones",
    title: "The moments that matter, on the timeline.",
    body: "Listening party, video shoot, release day. Milestones sit inside the release plan as dated events, so the team sees the big moments coming, not just the chores.",
    points: [
      "Milestones show up on the release timeline",
      "Dated around the drop",
      "Visible to everyone on the workspace",
    ],
  },
  {
    kicker: "Visibility",
    title: "Know where every release stands.",
    body: "One workspace shows every release you have going: progress, what's overdue, what's due this week, and which release each task belongs to. You stop needing a meeting to know the status.",
    points: [
      "All releases and tasks on one screen",
      "Click a release to see just its work",
      "Overdue and due-today shown first",
    ],
  },
] as const;

const headlineClass =
  "text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[3.6rem]";

export default function FeaturesPage() {
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
              Features
            </p>
            <h1 className="mt-8 text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem]">
              Everything a release needs.{" "}
              <span className="italic text-[var(--marketing-accent)]">
                Nothing it doesn&apos;t.
              </span>
            </h1>
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              Urganize gives your music the release it deserves. The plan, the
              work, and the status all live in one place.
            </p>
          </div>
        </SectionShell>

        {/* FEATURE BLOCKS */}
        {features.map((feature, index) => (
          <ScrollReveal key={feature.title}>
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
                    {feature.kicker}
                  </p>
                  <h2 className={`mt-5 ${headlineClass}`}>{feature.title}</h2>
                </div>
                <div>
                  <p className="text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
                    {feature.body}
                  </p>
                  <ul className="mt-7 space-y-3">
                    {feature.points.map((point) => (
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

              {"image" in feature ? (
                <div className="mx-auto mt-14 max-w-[64rem] overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
                  <Image
                    src={feature.image.src}
                    alt={feature.image.alt}
                    width={1920}
                    height={970}
                    className="h-auto w-full"
                    sizes="(min-width: 1088px) 1024px, 100vw"
                  />
                </div>
              ) : null}
            </SectionShell>
          </ScrollReveal>
        ))}

        {/* FINAL CTA */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={headlineClass}>
                Run your next release with a system.
              </h2>
              <div className="mt-10 flex w-full flex-col items-center gap-3">
                <WaitlistForm source="features_cta" />
                <ProofLine id="antoine" className="mt-2" />
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>
      </main>

      <MarketingFooter />
    </div>
  );
}
