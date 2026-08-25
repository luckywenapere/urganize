import { ProofLine } from "../ProofLine";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { WaitlistForm } from "../WaitlistForm";
import { centeredHeadlineClass } from "./shared";

export function FinalCTASection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[100px] lg:py-[120px]"
        containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
      >
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
            {/* The Founding Member line that used to sit here ("Founding
                Members: capped at 10 teams, price locked for life. 43% of
                teams that try Urganize pay for it. There is no sales
                team.") was REMOVED 2026-08-25 on the founder's call, in the
                same pass that cut the row titles from TransformationSection
                and the proof-numbers line from WorkspaceShotSection. The
                ask plus one real quote is the whole beat now. /pricing
                still carries its own, shorter Founding Member line
                ("...price locked for life. Still open.") — that one was
                deliberately left, so the two pages no longer mirror each
                other and the old never-disagree note no longer applies. Do
                not restore this without fresh founder-supplied figures. */}
            {/* Adenaiye's chaos/multiple-releases sentence — the sharpest
                ICP-match line on the site — at the last chance to convert a
                scroller. Swapped off tamuno 2026-08-13: his full quote
                already anchors the last row of TransformationSection, so
                mounting him here repeated the same words twice on one page. */}
            <ProofLine id="adenaiye" className="mt-2" />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
