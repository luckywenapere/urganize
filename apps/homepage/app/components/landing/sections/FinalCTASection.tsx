import { ProofLine } from "../ProofLine";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { WaitlistForm } from "../WaitlistForm";
import { centeredHeadlineClass } from "./shared";

// The journey's one terminal ask (2026-09-02): the trial button, one real
// quote, and the waitlist folded behind a text link for anyone not ready to
// start. Its terms line ("3 days free. No card.") was removed on a founder
// call (2026-09-11), the same pass that took the hero's. The form used to BE this beat's ask; since the two lowest
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
        className="py-[88px] lg:py-[112px]"
        containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
      >
        {/* HOMEPAGE V2 (2026-10-17, URG-334): `#waitlist` moved to the hero
            form, so the header button no longer jumps past the whole page.
            This block is `#join`. The note below is the history.

            THE ANCHOR SITS ON THE HEADLINE'S BLOCK, NOT THE FORM'S (2026-10-09).
            Every "Join waitlist" button on the site lands here via /#waitlist.
            The id used to be on the div under the h2, so a tap jumped to a bare
            email field with its headline scrolled off the top. scroll-mt-28 is
            112px against a 77px fixed header on a phone (81px on desktop). The
            section also slides up 20px as ScrollReveal shows it, after the
            browser has placed it, so the headline settles about 92px down: 15px
            clear of the header, not hidden behind it (scroll-mt-24 settled it
            flush against the header). */}
        <div id="join" className="scroll-mt-28 text-center">
          <h2 className={centeredHeadlineClass}>Your next release, on plan.</h2>

          {/* The waitlist form, always open (2026-10-07). */}
          <div className="relative z-[60] mt-10 flex w-full flex-col items-center gap-4">
            <div className="w-full">
              <WaitlistForm
                source="homepage_final_cta"
                buttonLabel="Join waitlist"
                hint={null}
                accent
              />
            </div>
            <ProofLine
              id="adenaiye"
              className="mt-3 w-full max-w-[30rem] border-t border-[color:var(--marketing-border)] pt-5"
            />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
