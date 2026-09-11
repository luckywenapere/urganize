import { PRODUCT_SHOTS } from "@/content/product-shots";
import { salesMailto } from "@/lib/sales-mailto";
import { ProofLine } from "../ProofLine";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { ThemedProductShot } from "../ThemedProductShot";
import { TrialButton } from "../TrialButton";
import { wideContainerClass } from "./shared";

// The position nobody else owns (2026-09-02): the manager or label running
// SEVERAL artists' releases with a team. Orphiq and Diamond Release both
// speak to the artist; this beat says who Urganize is for and, just as
// usefully, who it is not for. It sits third — right after the three steps —
// because a manager has to hear "for people running a roster with a team"
// before they care about an assistant.
//
// This is the page's mid-page ask, and a button with proof beside it is not
// a form: the 2026-08-25 mid-page waitlist FORM was cut the day it shipped
// because three identical forms read as pressure. Antoine's quote is the
// plan payoff ("the whole rollout was already laid out, week by week") and
// is mounted here for the first time — see ProofLine.tsx's mount table.
//
// LAYOUT (2026-09-11, founder call: "not laid out properly ... maybe the
// testimonial should be centralized"). Two rounds. THE SECOND ONE IS THE REAL
// FIX, and the first is worth knowing about so nobody re-derives it:
//
// Round 1 read the source, found two defects visible there (a ProofLine measure
// cap, and items-center) and shipped both. It did not fix the complaint. Round 2
// rendered the page and MEASURED it, which is the only way to settle a layout
// question: the text column is 661px tall and the product shot is 284px, so the
// right column had a 377px hole in it — larger than the image itself. That is
// what reads as "not laid out properly", and NO VALUE OF align-items FIXES IT,
// because align-items only decides where the void sits. items-center split it
// ~190px above and below; items-start piled all 377px into one block under the
// image, which is arguably worse.
//
// So the quote moved into the RIGHT column, under the shot. Columns went 661/284
// to 498/464 and the void was gone. That is also what the founder asked for in
// the first place — he reached for "centralize the testimonial" as a way to
// balance a lopsided section, and round 1 rejected the letter of it while
// ignoring what prompted it.
//
// A later founder call (2026-09-11) took out the audience paragraph that sat
// under the h2 ("Built for the people who run the rollout: managers, labels and
// their teams. Artists feel the results."), so the left column is shorter again
// — see the numbers below. items-start is what makes that a non-event: the two
// columns start together and the shorter one simply ends earlier, where under
// items-center any difference would be split into a gap at both ends.
//
// Consequences worth keeping:
//   - ProofLine.tsx's mount table rule (proof sits beside its CTA) still holds,
//     but now ACROSS the row rather than within one column. Below lg the grid
//     collapses and the order is text, CTA, shot, quote.
//   - The rule above the quote spans the full 560px column, which is exactly
//     the shot's width, so it lands flush with the image edge above it. That is
//     why ProofLine's left variant has no measure cap — see its header.
//   - UrgAnsSection uses a byte-identical grid and keeps items-center. Both
//     left columns have since been cut back and both are now shorter than
//     their shot, so the two are closer than they were — but they still
//     diverge deliberately. THE TWO DIVERGING IS THE POINT — do not re-sync.
//
// This beat is also the PILOT for globals.css's --space-* scale, which was
// declared with --phi and then never used by anything. Spacing here reads
// mt-[var(--space-N)] rather than mt-5; the ladder is 16·24·24·32·48. A phi
// COLUMN split was rejected on purpose: reading measure caps the text at 34rem,
// and ReleasesColumn.tsx:137 records a phi layout being killed by founder call
// in the product app for "filling neither axis."
const POINTS = [
  "Run several artists on one team and pick who each rollout is for.",
  "Invite a teammate for one artist and they see only that artist's rollouts.",
  "Hand a sign-in link to the designer or the DJ on WhatsApp. They choose their own password.",
] as const;

export function RosterSection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[80px] lg:py-[100px]"
        containerClassName={wideContainerClass}
      >
        <div className="mx-auto grid max-w-[74rem] items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-[34rem]">
            <p className="mono-label text-[var(--marketing-accent)]">Built for a roster</p>
            <h2 className="mt-[var(--space-3)] text-balance text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-[var(--marketing-text)] sm:text-[2.6rem] lg:text-[3rem]">
              One team. Every artist.
            </h2>
            <ul className="mt-[var(--space-4)] space-y-[var(--space-2)]">
              {POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-baseline gap-[var(--space-2)] text-[0.95rem] leading-7 text-[var(--marketing-text)]"
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

            <div className="mt-[var(--space-6)] flex flex-col items-start gap-[var(--space-2)]">
              <div className="flex flex-wrap items-center gap-x-[var(--space-3)] gap-y-[var(--space-2)]">
                <TrialButton location="roster" />
                <a
                  href={salesMailto("Label")}
                  className="text-sm font-medium text-[var(--marketing-text)] underline decoration-[color:var(--marketing-text-subtle)] underline-offset-4 transition-colors hover:decoration-[color:var(--marketing-text)]"
                >
                  Running a label? Book a demo with the founders →
                </a>
              </div>
              <a
                href="/pricing"
                className="text-sm text-[var(--marketing-text-muted)] underline decoration-[color:var(--marketing-border-strong)] underline-offset-4 transition-colors hover:text-[var(--marketing-text)]"
              >
                See pricing
              </a>
            </div>
          </div>

          <div>
            <div className="overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
              <ThemedProductShot
                {...PRODUCT_SHOTS.artistsRoster}
                alt="The Artists section of Settings in Urganize, listing the artists on one team above an Add an artist field."
                sizes="(min-width: 1024px) 560px, 100vw"
              />
            </div>
            <ProofLine
              id="antoine"
              align="left"
              className="mt-[var(--space-6)] border-t border-[color:var(--marketing-border)] pt-[var(--space-3)]"
            />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
