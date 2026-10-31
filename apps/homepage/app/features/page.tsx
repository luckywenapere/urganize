import type { Metadata } from "next";
import { ProofLine } from "../components/landing/ProofLine";
import { ThemedProductShot } from "../components/landing/ThemedProductShot";
import { PHONE_CROPS } from "@/content/product-shot-crops";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { TrialButton } from "../components/landing/TrialButton";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";

export const metadata: Metadata = buildPageMetadata({
  title: "Music release plan, tasks and press kit",
  description:
    "From idea to execution. Add a release and get the plan, week by week to release day, with an owner on every task. Plus UrgAns.",
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
    title: "Stop starting every release from zero.",
    // Numbers are the live playbooks (CLAUDE.md, shipped v0.55.0): single
    // 64 activities / 11 weeks, EP 90 / 16, album 113 / 21. The screenshot
    // below shows the EP one, so the copy names all three rather than
    // describing a single next to a 90-activity image.
    body: "Add a release and real managers have already written the plan: 64 tasks for a single, 90 for an EP, 113 for an album. Change anything.",
    points: [
      "Singles, EPs and albums each get their own playbook",
      "Every task dated back from drop day",
      // Never "reorder" — reordering has no UI (CLAUDE.md: the endpoint
      // was deleted 2026-07-10) and the honesty rule bans advertising it.
      "It\u2019s your plan. Edit or delete anything",
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
      alt: "A rollout open in Urganize: the Motion bar at 7 of 90, the week's activities each with an owner and a due date, and the UrgAns assistant open alongside asking what you want to get done today.",
    },
  },
] as const;

// Folded from five full-size blocks into one compact section (see the note
// above). One sentence per feature, tightened from the previously approved
// block copy — same claims, same honesty rule, less scroll.
const compactFeatures = [
  {
    kicker: "Tasks",
    title: "Nobody gets to say \u201cI didn\u2019t know.\u201d",
    body: "Every task has an owner, a due date and a priority. Finish one step and the next one unlocks.",
  },
  {
    kicker: "Press kit",
    title: "Stop rebuilding the EPK every drop.",
    body: "One link, built from work you\u2019ve already done. It tells you when your new release is missing, and you can take it down anytime.",
  },
  {
    kicker: "Assistant",
    title: "Type it. It\u2019s done.",
    body: "Tell UrgAns, the AI inside Urganize, to add a release, add a task or mark something done.",
  },
  {
    kicker: "Milestones",
    title: "Nobody forgets the video shoot.",
    body: "Listening party, shoot, drop day, all dated on the timeline the whole team sees.",
  },
  {
    kicker: "Visibility",
    title: "Know what\u2019s late without calling anyone.",
    body: "One list shows every release, with progress, what\u2019s overdue and what\u2019s due this week.",
  },
] as const;

const headlineClass =
  "text-balance text-[2rem] leading-[1.1] text-[var(--marketing-text)] sm:text-[2.8rem]";

export default function FeaturesPage() {
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
              Features
            </p>
            <h1 className="mt-8 text-balance text-[2.25rem] leading-[1.06] text-[var(--marketing-text)] sm:text-[3.6rem]">
              Everything your release needs.{" "}
              <span className="text-[var(--marketing-accent)]">
                None of the chasing.
              </span>
            </h1>
            {/* The 2026-08-19 brief banned container metaphors ("live in one
                place") and allowed "workspace" as the one place-word. The
                2026-09-09 positioning REVERSES both halves: "workspace" is
                banned in anything a person reads, and "from one place" is the
                product's own promise, so it is the sanctioned phrasing now. */}
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              The plan, who&rsquo;s on what and what&rsquo;s late, for every
              artist on your roster.
            </p>
            {/* CTA moved into the hero (2026-08-05, URG-218): the page
                previously had no ask until the very bottom, ~7 screens
                down, so anyone who stopped reading early never saw one.
                No ProofLine here on purpose (keep the first touch light);
                antoine stays on the final CTA below. Since the 2026-09-02
                homepage overhaul the ask is the free trial, the same
                TrialButton the homepage mounts; the waitlist survives as a
                disclosure under the final CTA. */}
            <div className="mt-8 flex w-full flex-col items-center gap-4">
              <TrialButton location="features_hero" size="lg" className="w-full sm:w-auto" />
              <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
                We are letting teams in from the waitlist.
              </p>
            </div>
          </PageDawn>
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
                    phoneCrop={PHONE_CROPS.scopedRelease}
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
                Everything else that usually lands on you.
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
                Run your next release without the chasing.
              </h2>
              <div className="mt-10 flex w-full flex-col items-center gap-4">
                <TrialButton location="features_cta" size="lg" className="w-full sm:w-auto" />
                <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
                  We are letting teams in from the waitlist.
                </p>
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
