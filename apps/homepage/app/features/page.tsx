import type { Metadata } from "next";
import Link from "next/link";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";

const APP_AUTH_URL = "https://app.urganize.app/auth";

export const metadata: Metadata = buildPageMetadata({
  title: "Features",
  description:
    "What Urganize does: a hand-crafted rollout plan, tasks your freelance team owns, per-release file storage, and event milestones, all in one workspace.",
  path: "/features",
});

// Every claim on this page must describe the product as it ships today.
// The honesty rule from /pricing applies here: we don't advertise what
// isn't built (no AI-guidance claims, no credits, no pre-save, no stages).
const features = [
  {
    kicker: "The plan",
    title: "A rollout plan, not a blank page.",
    body: "Create a release and Urganize lays out a hand-crafted 11-week rollout: 64 tasks from locking the master to compiling first-week stats. Written with working managers, signed off by design partners, and fully editable before you commit.",
    points: [
      "8 weeks pre-release, 3 weeks post-release",
      "Every task dated relative to your release day",
      "Edit, reorder, or delete anything: it's your plan",
    ],
  },
  {
    kicker: "Tasks",
    title: "Owned, dated, and in order.",
    body: "Every task has an owner, a due date, and a priority. Dependencies keep the order honest: artwork upload stays locked until the artwork is approved, and unlocks the moment it is.",
    points: [
      "Assign your A&R, PR, designer, distributor",
      "Blocked tasks show exactly what's blocking them",
      "Check things off from the release page or your queue",
    ],
  },
  {
    kicker: "Files",
    title: "Every file where it belongs.",
    body: "Masters, artwork, contracts, and split sheets, attached to the release they belong to, organized by category, with image previews. Stop excavating Google Drive the night before delivery.",
    points: [
      "Per-release storage with categories",
      "Audio, video, documents, and artwork",
      "Download links your whole team can use",
    ],
  },
  {
    kicker: "Milestones",
    title: "The moments that matter, on the timeline.",
    body: "Listening party, video shoot, release day: milestones sit inside the release plan as dated events, so the team sees the moments coming, not just the chores.",
    points: [
      "Event milestones render on the release timeline",
      "Dated relative to the drop",
      "Visible to everyone on the workspace",
    ],
  },
  {
    kicker: "Visibility",
    title: "Know where every release stands.",
    body: "One workspace shows every release in flight: progress, what's overdue, what's due this week, and which release it belongs to. The status conversation stops being a meeting.",
    points: [
      "All releases and tasks on one screen",
      "Click a release to scope down to its work",
      "Overdue and due-today surfaced first",
    ],
  },
] as const;

// Not built yet. Chappi is in development, not shipped, so this block gets
// its own "coming soon" caption and a subtle (not accent) kicker color to
// visually separate it from the five live features above it.
const comingSoon = {
  kicker: "Coming soon",
  title: "Chappi drafts the cover art brief.",
  body: "Chappi, the AI assistant we're building into Urganize, will turn your release details into a cover art brief your designer can work from, reviewed and approved in the same place as the rest of the release.",
  points: ["In development, not live yet", "Reviewed and approved inside the release"],
} as const;

const nonFeatures = [
  {
    title: "Revenue tracking",
    body: "We don't track streams, splits, or royalties. That's what distributors are for.",
  },
  {
    title: "Legal contracts",
    body: "We don't generate or enforce contracts. Get a lawyer for that. We'll store the PDF.",
  },
  {
    title: "Analytics dashboards",
    body: "We don't show streaming numbers or social metrics. Check your platforms.",
  },
  {
    title: "Distribution",
    body: "We don't upload to Spotify or Apple Music. Use your preferred distributor. We'll make sure it happens on time.",
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
              Urganize is the system of record for the release: where the plan
              lives, where the work happens, where the team sees status.
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
            </SectionShell>
          </ScrollReveal>
        ))}

        {/* COMING SOON — kept visually identical to the feature blocks above
            except for the subtle (not accent) kicker color and the explicit
            "not live yet" point, so it never reads as a shipped feature. */}
        <ScrollReveal>
          <SectionShell
            className="py-[60px] lg:py-[80px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto grid max-w-[64rem] items-start gap-10 border-t border-[color:var(--marketing-border)] pt-14 lg:grid-cols-2 lg:gap-16">
              <div>
                <p className="mono-label text-[var(--marketing-text-subtle)]">
                  {comingSoon.kicker}
                </p>
                <h2 className={`mt-5 ${headlineClass}`}>{comingSoon.title}</h2>
              </div>
              <div>
                <p className="text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
                  {comingSoon.body}
                </p>
                <ul className="mt-7 space-y-3">
                  {comingSoon.points.map((point) => (
                    <li
                      key={point}
                      className="flex items-baseline gap-4 text-[0.95rem] leading-7 text-[var(--marketing-text)]"
                    >
                      <span
                        className="font-mono text-[0.72rem] text-[var(--marketing-text-subtle)]"
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

        {/* WHAT IT DOESN'T DO */}
        <ScrollReveal>
          <SectionShell
            className="py-[100px] lg:py-[120px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[52rem] text-center">
              <p className="mono-label text-[var(--marketing-text-subtle)]">
                On purpose
              </p>
              <h2 className={`mt-6 ${headlineClass}`}>
                What Urganize doesn&apos;t do.
              </h2>
              <p className="mx-auto mt-6 max-w-[36rem] text-balance text-base leading-8 text-[var(--marketing-text-muted)]">
                We&apos;re opinionated about what we build. If it doesn&apos;t
                reduce operational chaos, it&apos;s out.
              </p>
            </div>

            <div className="mx-auto mt-14 grid max-w-[60rem] grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2">
              {nonFeatures.map((item) => (
                <div
                  key={item.title}
                  className="bg-[var(--marketing-bg)] px-6 py-7 text-left sm:px-7 sm:py-8"
                >
                  <p className="font-mono text-[0.95rem] font-semibold uppercase tracking-[0.06em] text-[var(--marketing-text)]">
                    {item.title}
                  </p>
                  <p className="mt-3 text-[0.92rem] leading-7 text-[var(--marketing-text-muted)]">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </SectionShell>
        </ScrollReveal>

        {/* FINAL CTA */}
        <ScrollReveal>
          <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
            <div className="text-center">
              <h2 className={headlineClass}>
                Run your next release with a system.
              </h2>
              <div className="mt-10 flex flex-col items-center gap-3">
                <Link
                  href={APP_AUTH_URL}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] hover:bg-[var(--marketing-primary-hover)] sm:text-base"
                >
                  Start free for 28 days
                </Link>
                <p className="font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
                  NO CARD REQUIRED
                </p>
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>
      </main>

      <MarketingFooter />
    </div>
  );
}
