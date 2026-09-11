import { PRODUCT_SHOTS } from "@/content/product-shots";
import {
  type TestimonialId,
  transformationPairs,
} from "@/content/testimonials";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { ThemedProductShot } from "../ThemedProductShot";
import { centeredHeadlineClass, wideContainerClass } from "./shared";

// The problem and the three steps, as one beat (2026-09-02).
//
// The 2026-08-25 trim cut the before/after rows as "too bulky", and a
// separate problem section would have put those three lines back as a beat
// of their own. Instead a step can OPEN with a `before` line — the house
// description of how the work ran, then what Urganize does about it.
//
// ⚠️ THE PAIRING IS BY ID, NOT BY POSITION, and it has to stay that way. It
// used to read `transformationPairs[index]`, which was fine only while every
// step had a line and the two arrays were the same length. Step 01's line was
// dropped on a founder call (2026-09-11), and under index pairing that would
// have silently slid 02's line onto 01 and 03's onto 02 — every step labelled
// with the wrong problem, and nothing failing. A step with no `beforeId`
// simply opens with its kicker.
//
// Those `before` strings are house copy, NOT the quoted people's words:
// content/testimonials.ts forbids styling them as quotes, and this file
// renders them as plain muted paragraphs for that reason. They also carry
// data-nosnippet: chat-chaos prose is exactly what Google once substituted
// for the page description (lib/seo.ts), and the strong description is only
// half of that fix.
const STEPS: readonly {
  kicker: string;
  title: string;
  body: string;
  shot: (typeof PRODUCT_SHOTS)[keyof typeof PRODUCT_SHOTS];
  alt: string;
  beforeId?: TestimonialId;
}[] = [
  {
    kicker: "01",
    // No `beforeId`: the "pinned chat" line was removed here on a founder
    // call (2026-09-11). The h2 above carries that framing now, in the past
    // tense. content/testimonials.ts still OWNS the string — /why-urganize
    // mirrors it byte-identically and is untouched — so this drops the
    // rendering, not the copy.
    title: "Create the rollout. Get the plan.",
    body:
      "Pick single, EP or album and answer seven quick questions. Urganize drafts the whole rollout from a playbook written by real managers and UrgAns tailors it to your rollout. A single gets 64 activities over 11 weeks. Approve it and the plan is live.",
    shot: PRODUCT_SHOTS.scopedRelease,
    alt: "A rollout open in Urganize: the activity list grouped by when it is due, with a progress bar counting finished activities against the plan.",
  },
  {
    kicker: "02",
    beforeId: "adenaiye",
    title: "Put a name on every activity.",
    body:
      "Assign it and they get an email with the rollout, the due date and a button that opens it. Activities unlock in order, so the next step is always clear.",
    shot: PRODUCT_SHOTS.activityDetail,
    alt: "An activity opened in Urganize, showing who it is assigned to, its due date and its place in the plan.",
  },
  {
    kicker: "03",
    beforeId: "tamuno",
    title: "See where every rollout stands.",
    body:
      "Open the catalog and see what is done, what is blocked and what is due this week, for every artist at once. Open one and see the whole rollout on a timeline, week by week.",
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
          const before = step.beforeId
            ? transformationPairs.find(
                (pair) => pair.testimonialId === step.beforeId,
              )?.before
            : undefined;
          return (
            <ScrollReveal key={step.title}>
              <div
                className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-14 ${
                  index % 2 === 1 ? "lg:[&>div:first-child]:order-2" : ""
                }`}
              >
                <div className="max-w-[32rem]">
                  {before ? (
                    <p
                      data-nosnippet
                      className="text-[0.95rem] leading-7 text-[var(--marketing-text-subtle)]"
                    >
                      {before}
                    </p>
                  ) : null}
                  <p className="mono-label mt-8 text-[var(--marketing-accent)]">
                    {step.kicker}
                  </p>
                  <h3 className="mt-3 text-balance text-[1.75rem] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--marketing-text)] sm:text-[2.1rem]">
                    {step.title}
                  </h3>
                  <p className="mt-5 text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
                    {step.body}
                  </p>
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
