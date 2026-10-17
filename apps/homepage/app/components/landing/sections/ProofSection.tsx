import { TESTIMONIALS } from "@/content/testimonials";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";

// One big quote, not a wall of them (2026-09-02). Three quote cards were
// weighed and rejected: roughly a screen and a half of text for a skimming
// phone visitor, and the third sentence we own (Adenaiye's second approved
// line) is also the least specific. Tamuno's is the most outcome-shaped
// sentence on the site — the status payoff, in the site's one A&R voice.
//
// The four signed-off voices each appear exactly once on this page:
// zaddyfunds under the hero CTA, Antoine under the roster CTA, Tamuno here,
// Adenaiye at the final CTA. Verbatim from content/testimonials.ts, never
// edited or truncated (that file's rule).
export function ProofSection() {
  const quote = TESTIMONIALS.tamuno;
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[72px] lg:py-[96px]"
        containerClassName="max-w-[64rem] px-6 sm:px-8 lg:px-10"
      >
        <figure className="mx-auto max-w-[52rem] text-center">
          <blockquote>
            <p className="text-balance text-[1.5rem] leading-[1.35] tracking-[-0.02em] text-[var(--marketing-text)] sm:text-[2rem] lg:text-[2.25rem]">
              &ldquo;{quote.quote}&rdquo;
            </p>
          </blockquote>
          <figcaption className="mt-7 font-mono text-[0.72rem] tracking-[0.18em] text-[var(--marketing-text-subtle)]">
            {quote.name} · {quote.role}
          </figcaption>
        </figure>
      </SectionShell>
    </ScrollReveal>
  );
}
