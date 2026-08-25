import { ThemedProductShot } from "../ThemedProductShot";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { WaitlistForm } from "../WaitlistForm";
import { wideContainerClass } from "./shared";

// Real screenshot of the current workspace (light and dark retaken together
// 2026-08-01, same catalog and scroll position in both so the shot follows
// the site's theme toggle cleanly). If the UI changes meaningfully, retake
// BOTH the light and dark version — never let marketing imagery lag the
// product again.
export function WorkspaceShotSection() {
  return (
    <ScrollReveal>
      <SectionShell
        containerClassName={wideContainerClass}
        className="py-[60px] lg:py-[80px]"
      >
        {/* The proof-numbers line that used to sit here ("7 founding teams,
            10 artists and 2 releases running right now. Live since January
            2026.") was REMOVED 2026-08-25 on the founder's call, in the same
            pass that cut the row titles from TransformationSection (itself
            removed 2026-08-25). The
            screenshot is the proof this beat needs; a small-numbers boast
            was doing the opposite of persuading. Do not restore it without
            a fresh founder-supplied count — the numbers here were only ever
            true as of the 2026-08 brief. The /pricing Founding Member claim
            and FinalCTASection's 43% line are separate and untouched. */}
        <div className="overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
          <ThemedProductShot
            light="/images/product/workspace-releases.png"
            dark="/images/product/workspace-releases-dark.png"
            alt="The Urganize catalog: a grid of release cards, each with cover art, a release date and a progress bar counting finished activities against its 64-activity plan. The top row runs from 0 of 64 done to 30 of 64."
            width={1920}
            height={970}
            sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
          />
        </div>

        {/* Mid-page ask (2026-08-25, founder request): the hero form and the
            final CTA sit five screens apart with only the header button in
            between, so the ask repeats once here — directly under the
            screenshot, the page's peak-proof moment. Inline in this section
            rather than a section of its own so it adds no new rhythm beat to
            a page that keeps getting trimmed for weight. Cuttable as a
            block. */}
        <div className="relative z-[60] mx-auto mt-12 flex w-full max-w-[44rem] flex-col items-center gap-3 text-center">
          <p className="text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
            Put your next release on plan.
          </p>
          <WaitlistForm source="homepage_mid" />
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
