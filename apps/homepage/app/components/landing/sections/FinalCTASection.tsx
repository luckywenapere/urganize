import { ProofLine } from "../ProofLine";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { TrialButton } from "../TrialButton";
import { WaitlistDisclosure } from "../WaitlistDisclosure";
import { centeredHeadlineClass } from "./shared";

// The journey's one terminal ask (2026-09-02): the trial button, its terms,
// one real quote, and the waitlist folded behind a text link for anyone not
// ready to start. The form used to BE this beat's ask; since the two lowest
// tiers went self-serve on 2026-08-30 the trial is, and a visitor who can
// start today should not be queued (see WaitlistDisclosure for why the
// waitlist survives at all).
//
// The Founding Member line that used to sit here ("Founding Members: capped
// at 10 teams, price locked for life. 43% of teams that try Urganize pay for
// it. There is no sales team.") was REMOVED 2026-08-25 on the founder's call.
// The offer's one surviving sentence lives in content/founding-member.ts and
// renders in the pricing strip; the 43% and no-sales-team claims stay out
// until the founder supplies fresh figures.
//
// Adenaiye's chaos/multiple-releases sentence is the sharpest ICP-match line
// on the site, at the last chance to convert a scroller. Each of the four
// signed-off voices appears once on the page: hers is here.
export function FinalCTASection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[100px] lg:py-[120px]"
        containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
      >
        <div className="text-center">
          <h2 className={centeredHeadlineClass}>Put your next rollout on plan.</h2>

          <div className="relative z-[60] mt-10 flex w-full flex-col items-center gap-4">
            <TrialButton location="final" size="lg" className="w-full sm:w-auto" />
            <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
              3 days free. No card.
            </p>
            <ProofLine
              id="adenaiye"
              className="mt-3 w-full max-w-[30rem] border-t border-[color:var(--marketing-border)] pt-5"
            />
            <div className="mt-6 w-full">
              <WaitlistDisclosure />
            </div>
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
