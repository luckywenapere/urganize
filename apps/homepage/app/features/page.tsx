import type { Metadata } from "next";
import { ProofLine } from "../components/landing/ProofLine";
import { ResponsiveProductShot } from "../components/landing/ResponsiveProductShot";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { SectionShell } from "../components/landing/SectionShell";
import { TrialButton } from "../components/landing/TrialButton";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { buildPageMetadata } from "@/lib/seo";
import { PageDawn } from "../components/marketing/PageDawn";
import type { ProductShot } from "@/content/product-shots";

export const metadata: Metadata = buildPageMetadata({
  title: "Plan new music, track every task, pitch with a press kit",
  description:
    "From idea to execution. Tell Urganize your goals and get a plan that fits, or make your own. Track every task, solo or with a team. After each task it asks how it went.",
  path: "/features",
});

// One small still per feature section (#962, mock approved by the founder
// 2026-11-01). Drawn pictures, not captures: the same window and the same
// card on every one so the six read as a set, in the app's light and dark
// tokens so they follow the site's theme toggle. The demo team is made up
// (Owambe Weather, Ife Mi, Temi Ivory). The numbers in them are the live ones
// (playbooks 64/90/113); if a screen they show changes, redraw both themes.
// Desktop 520x340 and phone 358x300, filmed at 2x.
type FeatureStillName = "plan" | "tasks" | "presskit" | "assistant" | "milestones" | "visibility";

function featureStill(name: FeatureStillName): { desktop: ProductShot; phone: ProductShot } {
  const base = `/images/product/features-${name}`;
  return {
    desktop: { light: `${base}.webp`, dark: `${base}-dark.webp`, width: 1040, height: 680 },
    phone: { light: `${base}-phone.webp`, dark: `${base}-phone-dark.webp`, width: 716, height: 600 },
  };
}

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
// Fixed by: a CTA in the hero, "The plan" kept as the one full-size block,
// and the other five folded into one compact section in a different format.
// Keep it that way. Since #962 every section carries its own small still
// (see featureStill above); the plan's replaced the full-width screenshot.
const features = [
  {
    kicker: "The plan",
    title: "Start from your goals, not from zero.",
    // Numbers are the live playbooks (CLAUDE.md, shipped v0.55.0): single
    // 64 activities / 11 weeks, EP 90 / 16, album 113 / 21. The still
    // below has the EP one picked, so the copy names all three rather than
    // describing a single next to a 90-activity image.
    body: "Urganize asks about your goals and makes a plan that fits: 64 tasks for a single, 90 for an EP, 113 for an album. Or start from a blank plan of your own.",
    points: [
      "Singles, EPs and albums each get their own playbook",
      "Every task dated back from drop day",
      // Never "reorder" — reordering has no UI (CLAUDE.md: the endpoint
      // was deleted 2026-07-10) and the honesty rule bans advertising it.
      "It\u2019s your plan. Edit or delete anything",
    ],
    still: {
      ...featureStill("plan"),
      alt: "A rollout in Urganize grouped by week, counted back from release day, with the playbook card showing Single 64 tasks, EP 90 tasks picked, and Album 113 tasks.",
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
    body: "Every task has an owner, a due date and a priority. Finish one and Urganize asks how it went, so the next plan fits better.",
    still: {
      ...featureStill("tasks"),
      alt: "A task list in Urganize: Lock the master file done, Upload to distributor open now, the next tasks locked, and a card showing its owner, its due date and High priority.",
    },
  },
  {
    kicker: "Press kit",
    title: "Your press kit goes with every pitch.",
    body: "Each artist gets a press kit with its own link, and Urganize sends it along when you pitch a curator.",
    still: {
      desktop: { light: "/images/product/guide-pitch.webp", dark: "/images/product/guide-pitch-dark.webp", width: 1360, height: 1200 },
      // The wide shot on phones too: the tall phone shot (716x1200) is twice the
      // height of the other stills and left a gap in the list.
      phone: { light: "/images/product/guide-pitch.webp", dark: "/images/product/guide-pitch-dark.webp", width: 1360, height: 1200 },
      alt: "A pitch to the curator Lola Adeyemi for Lagos Late Nights, with a private song link, a short note, a tick saying your kit goes with it, and a Send pitch button.",
    },
  },
  {
    kicker: "Assistant",
    title: "Type it. It\u2019s done.",
    body: "Tell the AI inside Urganize to add a release, add a task or mark something done.",
    still: {
      ...featureStill("assistant"),
      alt: "A message to AI asking it to add a task to Ife Mi to book the video shoot for Nov 12, its reply saying it is done, and the new task due Nov 12.",
    },
  },
  {
    kicker: "Milestones",
    title: "Nobody forgets the video shoot.",
    body: "Listening party, shoot, drop day, all dated on the timeline the whole team sees.",
    still: {
      ...featureStill("milestones"),
      alt: "A rollout timeline in Urganize with today marked, the listening party and the video shoot dated, and release day on Dec 13.",
    },
  },
  {
    kicker: "Visibility",
    title: "Know what\u2019s late without calling anyone.",
    body: "One list shows every release, with progress, what\u2019s overdue and what\u2019s due this week.",
    still: {
      ...featureStill("visibility"),
      alt: "Every rollout on the roster in one list with progress bars, one with 2 late and one with 3 due this week, and a card saying 2 tasks are late and 7 are due this week.",
    },
  },
] as const;

// Phone picture below sm, the wide one from sm up (ResponsiveProductShot picks
// one, so each visitor downloads two files per still: one per theme). Capped at
// its drawn width; below the fold, so no high fetch priority.
function FeatureStill({ still }: { still: ReturnType<typeof featureStill> & { alt: string } }) {
  return (
    <div className="max-w-[22.375rem] sm:max-w-[32.5rem]">
      <ResponsiveProductShot
        desktop={still.desktop}
        phone={still.phone}
        alt={still.alt}
        sizes="520px"
        fetchPriority="auto"
      />
    </div>
  );
}

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
              Plan new music.{" "}
              <span className="text-[var(--marketing-accent)]">
                Keep track of every task.
              </span>
            </h1>
            {/* The 2026-08-19 brief banned container metaphors ("live in one
                place") and allowed "workspace" as the one place-word. The
                2026-09-09 positioning REVERSES both halves: "workspace" is
                banned in anything a person reads, and "from one place" is the
                product's own promise, so it is the sanctioned phrasing now. */}
            <p className="mx-auto mt-8 max-w-[38rem] text-balance text-lg leading-8 text-[var(--marketing-text-muted)]">
              Your plan, your tasks and what&rsquo;s late, whether you work
              alone or with a team.
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
                We are letting people in from the waitlist.
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
                          ·
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mx-auto mt-14 max-w-[64rem]">
                <FeatureStill still={feature.still} />
              </div>
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
                    <div className="mt-6">
                      <FeatureStill still={item.still} />
                    </div>
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
                  We are letting people in from the waitlist.
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
