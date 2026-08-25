import { TESTIMONIALS, transformationPairs } from "@/content/testimonials";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass, mutedLeadClass } from "./shared";

// Replaces the old TestimonialSection (2026-07-31): the signed-off quotes,
// restructured as a before→after so the proof does more work than a
// decoration wall two-thirds down the page ever could. Moved to screen
// two, directly after the hero.
//
// The @zaddyfunds_ pull-quote that used to anchor this section now lives in
// the hero as a ProofLine — it is NOT duplicated here. Adenaiye's original
// pairing was retired 2026-07-31 the same day files went out of the
// marketing story; she returned 2026-08-05 (URG-220) with a new review, so
// this section now has three rows: plan (Antoine) -> team (Adenaiye) ->
// status (Tamuno). See content/testimonials.ts for the sign-off log.
//
// PLAIN-LANGUAGE PASS (2026-08-25, founder call: the section was confusing
// and a visitor clicked the words "The plan" expecting a link). Three
// things changed and each is load-bearing — do not undo one without
// re-reading why it is here:
//
//  1. There is NO per-row title. The rows used to be headed "The plan" /
//     "The team" / "Status" in accent-coloured uppercase mono — the same
//     styling this site's links use, which is what got clicked. A first
//     pass restyled them as plain <h3>s; the founder then cut them
//     outright (2026-08-25, same day) because a label naming the row adds
//     nothing the two cells do not already say. Do not reintroduce one.
//     `TransformationPair` no longer carries a `kicker` field.
//  2. The per-cell labels were "In WhatsApp + Drive" / "In Urganize",
//     repeating the same two facts six times down the section. They are
//     now plain "Before" / "After" and the WhatsApp-and-Drive fact is
//     stated ONCE, in the lead below the headline.
//  3. The lead exists because the grid never explained itself: a visitor
//     had to decode what the two columns meant. It says so outright, and
//     it is worded without "left"/"right" because the grid stacks to one
//     column below sm.
//
// Net effect: the section went from ten uppercase labels to one.
//
// ATTRIBUTION SAFEGUARD (read before touching this file): each row's FIRST
// cell is Urganize's own words about the pre-Urganize workflow (owned by
// content/testimonials.ts — see the provenance note there; /why-urganize
// mirrors two of the rows). It
// must never carry quote marks, a name, or a <figcaption> — that would
// misattribute Urganize's words to the testimonial person. The asymmetry
// between the two cells (plain muted text on one side; <figure> + curly
// quotes + named <figcaption> on the other) is structural, not just
// styling. Do not "balance" the two sides by adding attribution to the
// "Before" one.
export function TransformationSection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[100px] lg:py-[120px]"
        containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
      >
        <div className="mx-auto max-w-[52rem] text-center">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            What changed
          </p>
          {/* Executive repositioning (2026-08-19): the buyer this page
              addresses is the executive; the quoted people are the ones who
              run the releases day to day — which is exactly whose word an
              executive wants before buying. Roles render verbatim from
              testimonials.ts and are immutable. */}
          <h2 className={`mt-6 ${centeredHeadlineClass}`}>
            Before Urganize, and after.
          </h2>
          <p className={`mx-auto mt-6 max-w-[42rem] ${mutedLeadClass}`}>
            Before is how a release goes in WhatsApp and Drive. After is what
            the people who run releases told us.
          </p>
        </div>

        <div className="mt-16 space-y-12">
          {transformationPairs.map((pair) => {
            const testimonial = TESTIMONIALS[pair.testimonialId];
            return (
              <div
                key={pair.testimonialId}
                className="mx-auto max-w-[64rem] border-t border-[color:var(--marketing-border)] pt-12"
              >
                <div className="grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2">
                  {/* BEFORE — Urganize's own words, no quote marks, no name.
                      See the attribution safeguard note above the export. */}
                  <div className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8">
                    <p className="text-sm font-medium text-[var(--marketing-text-subtle)]">
                      Before
                    </p>
                    <p className="mt-3 text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                      {pair.before}
                    </p>
                  </div>

                  {/* AFTER — the real, signed-off quote, verbatim. */}
                  <figure className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8">
                    <p className="text-sm font-medium text-[var(--marketing-accent)]">
                      After
                    </p>
                    <blockquote>
                      <p className="mt-3 text-[0.95rem] leading-7 text-[var(--marketing-text)]">
                        &ldquo;{pair.quoteOverride ?? testimonial.quote}&rdquo;
                      </p>
                    </blockquote>
                    <figcaption className="mt-6 font-mono text-[0.74rem] tracking-[0.18em] text-[var(--marketing-text-subtle)]">
                      <span className="text-[var(--marketing-text)]">
                        {testimonial.name}
                      </span>
                      {" "}· {testimonial.role}
                    </figcaption>
                  </figure>
                </div>
              </div>
            );
          })}
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
