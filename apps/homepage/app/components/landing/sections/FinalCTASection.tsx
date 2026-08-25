import { ProofLine } from "../ProofLine";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { WaitlistForm } from "../WaitlistForm";
import { centeredHeadlineClass } from "./shared";

export function FinalCTASection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10">
        <div className="text-center">
          <h2 className={centeredHeadlineClass}>
            Releases shouldn&apos;t be hard to run.
          </h2>

          {/* The one artists-as-advocates line on the page (2026-08
              positioning: executives buy, artists benefit, word spreads).
              Addressed to the executive — never to the artist. Cuttable if
              the page ever feels heavy again. */}
          <p className="mx-auto mt-6 max-w-[32rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
            Your artists will feel the difference.
          </p>

          <div className="relative z-[60] mt-10 flex w-full flex-col items-center gap-3">
            <WaitlistForm source="homepage_final_cta" />
            {/* Founding Member line at the decision point, not the hero:
                scarcity belongs next to the ask. Every claim here is
                checkable — the cap, the price lock and the conversion
                figure are founder-supplied (2026-08 brief); /pricing
                carries a matching line so the two pages never disagree.
                The 43% sentence is the founder's first-cut candidate if
                this ever reads as too much. */}
            <p className="mx-auto max-w-[30rem] text-balance text-sm leading-6 text-[var(--marketing-text-subtle)]">
              Founding Members: capped at 10 teams, price locked for life.
              43% of teams that try Urganize pay for it. There is no sales
              team.
            </p>
            {/* Adenaiye's chaos/multiple-releases sentence — the sharpest
                ICP-match line on the site — at the last chance to convert a
                scroller. Swapped off tamuno 2026-08-13: his full quote
                already anchors TransformationSection's "The status" row, so
                mounting him here repeated the same words twice on one page. */}
            <ProofLine id="adenaiye" className="mt-2" />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
