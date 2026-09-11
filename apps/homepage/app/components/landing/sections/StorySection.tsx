import { PRODUCT_SHOTS } from "@/content/product-shots";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { ThemedProductShot } from "../ThemedProductShot";
import { centeredHeadlineClass, wideContainerClass } from "./shared";

// The problem and the three steps, as one beat (2026-09-02).
//
// Each step opened with a `before` line — the house description of how the
// work used to run — and closed with a `body` explaining the step. A founder
// call on 2026-09-11 removed all six, a line at a time, so a step is now a
// kicker, a title and a screenshot, and the h2 above carries the whole problem
// framing on its own, in the past tense.
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
  kicker: string;
  title: string;
  shot: (typeof PRODUCT_SHOTS)[keyof typeof PRODUCT_SHOTS];
  alt: string;
}[] = [
  {
    kicker: "01",
    title: "Create the rollout. Get the plan.",
    shot: PRODUCT_SHOTS.scopedRelease,
    alt: "A rollout open in Urganize: the activity list grouped by when it is due, with a progress bar counting finished activities against the plan.",
  },
  {
    kicker: "02",
    title: "Put a name on every activity.",
    shot: PRODUCT_SHOTS.activityDetail,
    alt: "An activity opened in Urganize, showing who it is assigned to, its due date and its place in the plan.",
  },
  {
    kicker: "03",
    title: "See where every rollout stands.",
    shot: PRODUCT_SHOTS.timeline,
    alt: "The Timeline view of a rollout in Urganize: every activity on a week axis with today marked.",
  },
] as const;

export function StorySection() {
  return (
    <SectionShell
      className="py-[80px] lg:py-[100px]"
      containerClassName={wideContainerClass}
    >
      <ScrollReveal>
        <div className="mx-auto max-w-[52rem] text-center">
          <h2 className={centeredHeadlineClass}>
            Rollouts used to run on chat threads and memory.
          </h2>
        </div>
      </ScrollReveal>

      <div className="mx-auto mt-16 max-w-[74rem] space-y-16 lg:space-y-24">
        {STEPS.map((step, index) => {
          return (
            <ScrollReveal key={step.title}>
              <div
                className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-14 ${
                  index % 2 === 1 ? "lg:[&>div:first-child]:order-2" : ""
                }`}
              >
                <div className="max-w-[32rem]">
                  <p className="mono-label text-[var(--marketing-accent)]">
                    {step.kicker}
                  </p>
                  <h3 className="mt-3 text-balance text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--marketing-text)] sm:text-[2.1rem]">
                    {step.title}
                  </h3>
                </div>
                <div className="overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
                  <ThemedProductShot
                    {...step.shot}
                    alt={step.alt}
                    sizes="(min-width: 1024px) 560px, 100vw"
                  />
                </div>
              </div>
            </ScrollReveal>
          );
        })}
      </div>
    </SectionShell>
  );
}
