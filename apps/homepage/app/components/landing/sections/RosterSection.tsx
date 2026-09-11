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
// testimonial should be centralized ... guided by the golden ratio"). Centring
// the quote was considered and rejected: ProofSection is a large centred
// blockquote two beats later, so two centred quotes would land close together,
// and ProofLine.tsx's mount table puts proof BESIDE its CTA. The quote stays;
// what was wrong was mechanical, and both halves are fixed here:
//
//   1. items-center → items-start. UrgAnsSection uses a byte-identical grid,
//      but its left column holds four elements against this one's ten, so the
//      shot floated at mid-height and the quote hung past its bottom edge.
//      THE TWO SECTIONS DIVERGING IS THE POINT — do not re-sync them.
//      /features:153 is the house precedent for items-start on unequal columns.
//   2. ProofLine's left variant lost its 30rem cap, so the rule now runs the
//      column's full 34rem and lands level with the headline and bullets.
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
            <p className="mt-[var(--space-3)] text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
              Built for the people who run the rollout: managers, labels and
              their teams. Artists feel the results.
            </p>
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
              <ProofLine id="antoine" align="left" className="mt-[var(--space-1)] border-t border-[color:var(--marketing-border)] pt-[var(--space-3)]" />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
            <ThemedProductShot
              {...PRODUCT_SHOTS.artistsRoster}
              alt="The Artists section of Settings in Urganize, listing the artists on one team above an Add an artist field."
              sizes="(min-width: 1024px) 560px, 100vw"
            />
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
