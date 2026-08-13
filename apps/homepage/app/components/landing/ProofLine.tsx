import { TESTIMONIALS, type TestimonialId } from "@/content/testimonials";

// A compact proof line, meant to sit directly under a WaitlistForm at every
// CTA on the site (see the mount table below). Deliberately a typographic
// line, not a card: a bordered/filled box immediately under a bordered
// input + pill button reads as a second competing CTA. This costs ~2 lines
// instead of a ~120px box.
//
// No "use client" — pure presentational, no hooks — so it works in every
// server page AND inside PricingPageClient's client tree without caring
// which kind of parent it's in.
//
// Mount table (which quote goes where, and why):
//   homepage_hero      → zaddyfunds  (shortest quote, the only publicly
//                                      verifiable one — max credibility
//                                      per pixel, right where the primary
//                                      CTA lives)
//   homepage_final_cta → adenaiye    (sharpest ICP-match sentence; swapped
//                                      off tamuno 2026-08-13 — his full
//                                      quote already anchors Transformation-
//                                      Section's "Status" row on the same
//                                      page, so this mount repeated it)
//   features_cta       → antoine     (plan-already-laid-out fits the page)
//   why_urganize_cta   → tamuno      (status-at-a-glance is that page's
//                                      remaining thesis; swapped off
//                                      adenaiye 2026-07-31 when her
//                                      files-in-three-chats quote was
//                                      retired, see content/testimonials.ts.
//                                      Her new 2026-08-05 review appears on
//                                      the site via TransformationSection's
//                                      "team" row and the /for-managers
//                                      featured testimonial — not as a
//                                      ProofLine mount, so this row's choice
//                                      stands.)
//   pricing            → zaddyfunds  (short + linkable on an otherwise
//                                      all-numbers-free page)
//   for_managers_cta   → (none)      a full quote already sits directly
//                                      above that page's form — a second
//                                      one would stack two testimonials
//                                      on one CTA.

interface ProofLineProps {
  id: TestimonialId;
  align?: "center" | "left";
  className?: string;
}

export function ProofLine({ id, align = "center", className }: ProofLineProps) {
  const testimonial = TESTIMONIALS[id];

  return (
    <figure
      className={[
        align === "center" ? "mx-auto max-w-[30rem] text-center" : "max-w-[30rem] text-left",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <blockquote>
        <p className="text-balance text-[0.95rem] leading-7 text-[var(--marketing-text-muted)]">
          &ldquo;{testimonial.quote}&rdquo;
        </p>
      </blockquote>
      <figcaption className="mt-3 font-mono text-[0.72rem] tracking-[0.18em] text-[var(--marketing-text-subtle)]">
        {testimonial.href ? (
          <a
            href={testimonial.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--marketing-text)] underline decoration-[color:var(--marketing-text-subtle)] underline-offset-4 transition-colors hover:decoration-[color:var(--marketing-text)]"
          >
            {testimonial.name}
          </a>
        ) : (
          <span className="text-[var(--marketing-text)]">{testimonial.name}</span>
        )}
        {" "}· {testimonial.role}
      </figcaption>
    </figure>
  );
}
