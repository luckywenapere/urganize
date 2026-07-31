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
            {/* Strongest relief-close quote (Tamuno-Tekena: "that's a call I
                don't have to make anymore") at the site's last chance to
                convert a scroller. */}
            <ProofLine id="tamuno" className="mt-2" />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
