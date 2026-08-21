import { ScrollReveal } from "./ScrollReveal";
import { SectionShell } from "./SectionShell";

// The full-size, alternating value block used by every persona page
// (/for-executives, /for-managers, /for-labels, /for-curators,
// /for-ai-artists). Extracted 2026-08-21 when the third, fourth and fifth
// persona pages landed: /for-managers and /for-labels carried a
// byte-identical 43-line copy of this markup each, and five copies of it
// is how the two drift apart. The rendered output is unchanged from those
// two copies — this is a lift, not a redesign.
//
// `points` is optional so a page can run a block as prose only. Blocks
// alternate sides on lg+ by index, same as before.
export interface PersonaValueBlock {
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  readonly points?: readonly string[];
}

// The persona pages' h2 scale. Deliberately larger than the landing page's
// `centeredHeadlineClass` (sections/shared.ts): a persona page's blocks are
// the page, not one beat inside a longer scroll.
export const PERSONA_HEADLINE_CLASS =
  "text-balance text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[3.6rem]";

export function PersonaValueBlocks({
  blocks,
}: {
  blocks: readonly PersonaValueBlock[];
}) {
  return (
    <>
      {blocks.map((block, index) => (
        <ScrollReveal key={block.title}>
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
                  {block.kicker}
                </p>
                <h2 className={`mt-5 ${PERSONA_HEADLINE_CLASS}`}>
                  {block.title}
                </h2>
              </div>
              <div>
                <p className="text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
                  {block.body}
                </p>
                {block.points ? (
                  <ul className="mt-7 space-y-3">
                    {block.points.map((point) => (
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
                ) : null}
              </div>
            </div>
          </SectionShell>
        </ScrollReveal>
      ))}
    </>
  );
}
