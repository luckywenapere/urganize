import type { Metadata } from "next";
import { ProofLine } from "../components/landing/ProofLine";
import { ThemedProductShot } from "../components/landing/ThemedProductShot";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Features",
  description:
    "What Urganize does: a rollout plan for every release, activities your team owns and a press kit you send as one link. Plus UrgAns, the assistant in your workspace.",
  path: "/features",
});

// Every claim on this page must describe the product as it ships today.
// The honesty rule from /pricing applies here: we don't advertise what
// isn't built (no credits, no pre-save, no stages). The Assistant row's
// conversational framing became truthful on 2026-08-13, when UrgAns went
// live in production with a wired tool-calling model — AI verbs must still
// only describe what UrgAns actually does in prod today.
//
// 2026-08-05 (URG-218): same conversion fix as /why-urganize. This page
// had no CTA until the very bottom (~7 screens down) and ran SIX identical
// kicker/title/body/bullets blocks in a row, only the first of which had a
// screenshot — readers extract the pattern after block one and stop.
// Fixed by: a CTA in the hero, "The plan" (with its screenshot) kept as
// the one full-size block, and the other five folded into one compact
// section in a different format. Keep it that way.
const features = [
  {
    kicker: "The plan",
    title: "A rollout plan, not a blank page.",
    // Numbers are the live playbooks (CLAUDE.md, shipped v0.55.0): single
    // 64 activities / 11 weeks, EP 90 / 16, album 113 / 21. The screenshot
    // below shows the EP one, so the copy names all three rather than
    // describing a single next to a 90-activity image.
    body: "Create a release and Urganize lays out the whole rollout, written by real managers and sized to the format: 64 activities for a single, 90 for an EP, 113 for an album. Edit or delete any activity.",
    points: [
      "Singles, EPs and albums each get their own playbook",
      "Every activity dated around your release day",
      // Never "reorder" — reordering has no UI (CLAUDE.md: the endpoint
      // was deleted 2026-07-10) and the honesty rule bans advertising it.
      "Edit or delete anything. It's your plan",
    ],
    // Real screenshot of the current release view (light and dark retaken
    // together 2026-08-25, founder-supplied, same release and scroll
    // position in both — an EP, "Starlife", on the 90-activity EP playbook,
    // with the UrgAns rail open). Same house rule as the landing page: if
    // the UI changes meaningfully, retake BOTH the light and dark version —
    // marketing imagery never lags the product.
    image: {
      src: "/images/product/workspace-tasks.png",
      darkSrc: "/images/product/workspace-tasks-dark.png",
      alt: "A release open in Urganize: the Motion bar at 7 of 90, the week's activities each with an owner and a due date, and the UrgAns assistant open alongside asking what you want to get done today.",
    },
  },
] as const;

// Folded from five full-size blocks into one compact section (see the note
// above). One sentence per feature, tightened from the previously approved
// block copy — same claims, same honesty rule, less scroll.
const compactFeatures = [
  {
    kicker: "Activities",
    title: "Owned, dated and in order.",
    body: "Every activity has an owner, a due date and a priority. A blocked activity unlocks the moment the step it's waiting on is done.",
  },
  {
    kicker: "Press kit",
    title: "One link, ready to send.",
    body: "Urganize builds a press kit from your release, keeps it up to date when the release changes, and you can turn the link off anytime.",
  },
  {
    kicker: "Assistant",
    title: "UrgAns handles the small stuff.",
    body: "Tell the assistant built into your workspace what you need. Create a release, add an activity, mark something done. Type it and it happens.",
  },
  {
    kicker: "Milestones",
    title: "The moments that matter, on the timeline.",
    body: "Listening party, video shoot, release day. Milestones sit inside the release plan as dated events the whole team sees coming.",
  },
  {
    kicker: "Visibility",
    title: "Know where every release stands.",
    body: "One workspace shows every release you have going: progress, what's overdue and what's due this week. No meeting needed.",
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
            {/* Executive repositioning (2026-08-19): the old subhead
                addressed the artist ("your music") and used the banned
                "live in one place" container metaphor. "Workspace" is the
                one allowed place-word. */}
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              Urganize runs the plan, the work and the status for every
              release in one workspace.
            </p>
            {/* CTA moved into the hero (2026-08-05, URG-218): the page
                previously had no ask until the very bottom, ~7 screens
                down, so anyone who stopped reading early never saw one.
                No ProofLine here on purpose (keep the first touch light);
                antoine stays on the final CTA below. */}
            <div className="mt-8 flex w-full flex-col items-center gap-3">
              <WaitlistForm source="features_hero" />
            </div>
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
                  <ThemedProductShot
                    light={feature.image.src}
                    dark={feature.image.darkSrc}
                    alt={feature.image.alt}
                    width={1920}
                    height={973}
                    sizes="(min-width: 1088px) 1024px, 100vw"
                  />
                </div>
              ) : null}
            </SectionShell>
          </ScrollReveal>
        ))}

        {/* THE REST OF THE TOOLKIT, COMPACTED (2026-08-05, URG-218) — was
            five more full-size blocks (Activities, Press kit, Assistant,
            Milestones, Visibility); folded into one section, one sentence
            per feature. See the features array comment. */}
        <ScrollReveal>
          <SectionShell
            className="py-[60px] lg:py-[80px]"
            containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
          >
            <div className="mx-auto max-w-[64rem] border-t border-[color:var(--marketing-border)] pt-14">
              <p className="mono-label text-[var(--marketing-accent)]">
                Everything else
              </p>
              <h2 className={`mt-5 max-w-[40rem] ${headlineClass}`}>
                The rest of what a release gets.
              </h2>

              <div className="mt-10 divide-y divide-[color:var(--marketing-border)]">
                {compactFeatures.map((item) => (
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
