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

          <div className="relative z-[60] mt-10 flex w-full flex-col items-center gap-3">
            <WaitlistForm source="homepage_final_cta" />
            {/* Adenaiye's chaos/multiple-releases sentence — the sharpest
                ICP-match line on the site — at the last chance to convert a
                scroller. Swapped off tamuno 2026-08-13: his full quote
                already anchors TransformationSection's "Status" row, so
                mounting him here repeated the same words twice on one page. */}
            <ProofLine id="adenaiye" className="mt-2" />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
