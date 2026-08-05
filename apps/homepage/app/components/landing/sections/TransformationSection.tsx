import { TESTIMONIALS, transformationPairs } from "@/content/testimonials";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass } from "./shared";

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
// ATTRIBUTION SAFEGUARD (read before touching this file): each row's LEFT
// cell is Urganize's own words about the pre-Urganize workflow (lifted
// verbatim from the already-approved /why-urganize comparison copy). It
// must never carry quote marks, a name, or a <figcaption> — that would
// misattribute Urganize's words to the testimonial person. The asymmetry
// between the two cells (plain muted text on the left; <figure> + curly
// quotes + named <figcaption> on the right) is structural, not just
// styling. Do not "balance" the two sides by adding attribution to the
// left one.
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
          <h2 className={`mt-6 ${centeredHeadlineClass}`}>
            They moved their releases into one home. In their words.
          </h2>
        </div>

        <div className="mt-16 space-y-12">
          {transformationPairs.map((pair) => {
            const testimonial = TESTIMONIALS[pair.testimonialId];
            return (
              <div
                key={pair.testimonialId}
                className="mx-auto max-w-[64rem] border-t border-[color:var(--marketing-border)] pt-12"
              >
                <p className="mono-label text-[var(--marketing-accent)]">
                  {pair.kicker}
                </p>

                <div className="mt-8 grid grid-cols-1 gap-px bg-[color:var(--marketing-border)] sm:grid-cols-2">
                  {/* BEFORE — Urganize's own words, no quote marks, no name.
                      See the attribution safeguard note above the export. */}
                  <div className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8">
                    <p className="mono-label text-[var(--marketing-text-subtle)]">
                      In WhatsApp + Drive
                    </p>
                    <p className="mt-4 text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
                      {pair.before}
                    </p>
                  </div>

                  {/* AFTER — the real, signed-off quote, verbatim. */}
                  <figure className="bg-[var(--marketing-bg)] px-6 py-7 sm:px-7 sm:py-8">
                    <p className="mono-label text-[var(--marketing-accent)]">
                      In Urganize
                    </p>
                    <blockquote>
                      <p className="mt-4 text-[0.95rem] leading-7 text-[var(--marketing-text)]">
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
