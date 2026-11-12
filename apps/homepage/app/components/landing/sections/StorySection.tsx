import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { StoryDemo, type StoryDemoName } from "../story/StoryDemo";
import { wideContainerClass } from "./shared";

// ONE SMALL ANIMATION PER STEP (2026-11-01, #953, mocks approved by the
// founder): the three cropped desktop screenshots are gone. Each step now
// plays a short scene of the step happening (the plan arriving, an owner and
// a date being picked, a late activity caught and moved), with its finished
// state as the poster. See story/StoryDemo.tsx. The demo team is Northline
// Music and the artist Kanmi Gold, both fictional.

// NO A/B/C BADGES (2026-10-19, founder call): the circled A, B and C above
// each h2 (and their sr-only "Step X:" prefix) are gone, and with them the
// `kicker` field and the h2's mt-5, so each text block (h2 + line) sits
// vertically centred against its shot. A step is a title, a line and a shot.
//
// HOMEPAGE V2 (2026-10-17, URG-334, mock awaiting founder approval): the steps
// were A, B and C (the founder's "easy as ABC"), and each carries ONE short line
// again. That reverses part of the 2026-09-11 call recorded below, on purpose
// and flagged for the founder. The problem framing that call removed now
// lives in its own beat right above this one (PainSection), as the note below
// says to put back first.
//
// Three steps, as one beat (2026-09-02). It opened with the problem, and no
// longer does — see below.
//
// Each step opened with a `before` line — the house description of how the
// work used to run — and closed with a `body` explaining the step. A founder
// call on 2026-09-11 removed all six, a line at a time, leaving the h2 to
// carry the whole problem framing on its own; the same call then took the h2
// ("Rollouts used to run on chat threads and memory."). So a step is a kicker,
// a title and a screenshot, and THE BEAT RUNS HEADLESS — with it, the landing
// page states no problem anywhere. That is the founder's call rather than an
// oversight, and it is the thing to put back first if the page ever reads as
// jumping from the hero straight into features.
//
// The heading block went whole (its ScrollReveal and centred div with it — a
// wrapper around nothing is dead markup), and `mt-16` went with it: those 64px
// spaced the steps BELOW the heading, and left in they would stack on
// SectionShell's own py-[80px] lg:py-[100px]. This beat now starts where
// Roster and UrgAns start.
//
// THE STEP TITLES ARE h2 BECAUSE THE SECTION HAS NO OTHER HEADING (founder
// call, asked). Three h3s under no h2 is a level skip straight from the hero's
// h1, and these three are the page's top-level product statements now. It
// costs no pixels: globals.css's one heading rule groups h1-h6 with identical
// declarations and nothing targets a single level, so the tag carries none of
// the styling — all of it is on the element as classes. If a section heading
// ever comes back, these go back to h3 in the same edit.
//
// `centeredHeadlineClass` is NOT dead, so do not delete it: five other
// sections still use it (PricingStrip, FeatureGrid, Faq, FinalCTA). Only this
// file's import of it went.
//
// So this file no longer reads content/testimonials.ts at all. The three
// strings are still OWNED there, and two of them (Antoine's and Adenaiye's)
// are still mirrored byte-identically by /why-urganize, which renders them —
// that array is a sign-off ledger of real people's approved copy, not dead
// code, and it is where the lines come back from if this beat ever wants them.
//
// Two things went with them, both worth knowing before adding a line back.
// The kicker's top margin existed only to clear a problem line. And those
// paragraphs carried data-nosnippet, because chat-chaos prose is exactly what
// Google once substituted for the page description (lib/seo.ts) — a new one
// needs that attribute again, and the strong description is only half of that
// fix.
const STEPS: readonly {
  title: string;
  line: string;
  demo: StoryDemoName;
  // What the scene's finished state shows (its poster)
  alt: string;
}[] = [
  {
    title: "Start from your goals.",
    line: "Urganize asks what you want, then makes a plan that fits. Or build your own.",
    demo: "plan",
    alt: "A new rollout's plan in Urganize: four weeks of tasks down to release day, each with an owner, 18 tasks in all.",
  },
  {
    title: "Keep track of every task.",
    line: "Every task has one owner and one date. Work solo, or bring your team in and each person sees what\u2019s theirs.",
    demo: "owner",
    alt: "A task open in Urganize with Ife Bassey as its owner and Fri 13 Nov as its date.",
  },
  {
    title: "See what\u2019s late, and what worked.",
    line: "One timeline shows what\u2019s done, what\u2019s late and what\u2019s next. After every task, Urganize asks how it went, so you can see what worked when the release is out.",
    demo: "late",
    alt: "A rollout's timeline in Urganize: Pitch to curators is marked Overdue once today passes its date, then moved to a later day that still lands before release day.",
  },
] as const;

export function StorySection() {
  return (
    <SectionShell
      className="py-[72px] lg:py-[96px]"
      containerClassName={wideContainerClass}
    >
      <div className="mx-auto max-w-[74rem] space-y-16 lg:space-y-24">
        {STEPS.map((step, index) => {
          return (
            <ScrollReveal key={step.title}>
              <div
                className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-14 ${
                  index % 2 === 1 ? "lg:[&>div:first-child]:order-2" : ""
                }`}
              >
                <div className="max-w-[32rem]">
                  <h2 className="text-balance text-[1.6rem] leading-[1.15] text-[var(--marketing-text)] sm:text-[2rem]">
                    {step.title}
                  </h2>
                  <p className="mt-3 text-[1.02rem] leading-7 text-[var(--marketing-text-muted)]">
                    {step.line}
                  </p>
                </div>
                <StoryDemo name={step.demo} label={step.alt} />
              </div>
            </ScrollReveal>
          );
        })}
      </div>
    </SectionShell>
  );
}
