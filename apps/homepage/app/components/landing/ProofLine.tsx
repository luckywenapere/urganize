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
//   homepage (proof)   → tamuno      (2026-09-02: NOT a ProofLine mount —
//                                      the single large blockquote in
//                                      ProofSection. Listed so the "each
//                                      voice once per page" accounting is
//                                      visible: zaddyfunds hero, tamuno
//                                      proof, adenaiye final. Antoine's
//                                      homepage_roster row above was retired
//                                      2026-09-11 with RosterSection itself —
//                                      his one remaining mount is features_cta,
//                                      below, so he no longer speaks on the
//                                      homepage at all.)
//   homepage_final_cta → adenaiye    (sharpest ICP-match sentence; swapped
//                                      off tamuno 2026-08-13 to avoid
//                                      repeating his then-on-page full
//                                      quote. TransformationSection was
//                                      removed 2026-08-25; her mount stands
//                                      on the ICP-match merit alone.)
//   features_cta       → antoine     (plan-already-laid-out fits the page)
//   why_urganize_cta   → tamuno      (status-at-a-glance is that page's
//                                      remaining thesis; swapped off
//                                      adenaiye 2026-07-31 when her
//                                      files-in-three-chats quote was
//                                      retired, see content/testimonials.ts.
//                                      Her new 2026-08-05 review appears on
//                                      the site via the /for-managers
//                                      featured testimonial (its Transform-
//                                      ationSection mount was removed
//                                      2026-08-25) — not as a ProofLine
//                                      mount, so this row's choice stands.)
//   pricing            → zaddyfunds  (short + linkable on an otherwise
//                                      all-numbers-free page)
//   for_managers_cta   → (none)      a full quote already sits directly
//                                      above that page's form — a second
//                                      one would stack two testimonials
//                                      on one CTA.
//   for_executives_cta → (none)      same reason: tamuno's full quote (the
//                                      site's one A&R voice, so the right
//                                      one for that page) sits above the
//                                      form. He also carries
//                                      why_urganize_cta — a different page,
//                                      which the no-stacking rule allows.
//   for_curators_cta   → (none)      every quote on this site is from a
//                                      manager or an A&R. Under a CURATOR's
//                                      CTA that's proof from the other side
//                                      of the pitch, so that page runs
//                                      without one until a curator gives us
//                                      a quote of their own.
//   for_ai_artists_cta → (none)      no AI artist has given us a quote. We
//                                      don't borrow an adjacent audience's
//                                      voice to stand in for one.

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
        // Only the centred variant sets its own measure. A centred mount floats
        // in a full-width stack with nothing else establishing one, so it needs
        // the 30rem cap. A left mount sits inside a column that has ALREADY set
        // one, and capping again leaves its border-t stopping short of whatever
        // it is meant to divide — a divider ending short of its own content
        // reads as an accident. Let the parent column govern instead.
        //
        // No current mount uses align="left" — RosterSection was the one
        // consumer (under that section's product shot in a 560px column, so
        // the rule landed flush with the image edge directly above it), and
        // it was removed 2026-09-11. Kept rather than deleted: the next left
        // mount should reuse this variant instead of inventing a second one,
        // the same call shared.ts's mutedLeadClass makes for its own orphan.
        // text-balance still keeps the quote itself to a readable measure
        // whenever a left mount does return.
        align === "center" ? "mx-auto max-w-[30rem] text-center" : "text-left",
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
