import { ThemedProductShot } from "../ThemedProductShot";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
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
        className="py-[80px] lg:py-[100px]"
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
            height={973}
            sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
          />
        </div>

        {/* The mid-page waitlist ask ("Put your next release on plan." +
            a WaitlistForm tagged homepage_mid) lived here for part of
            2026-08-25 and was REMOVED the same day, founder call. It was
            built to bridge a five-screen gap between the hero form and the
            final CTA; the before/after and playbook removals closed that
            gap hours later, leaving three identical forms on a
            five-section page — pressure, not convenience. The header's
            persistent button plus the hero and final forms cover every
            scroll position within ~2 screens now. homepage_mid collected
            for under a day, so its analytics tag carries no history worth
            preserving. Rebuild from git history if the page ever grows
            long enough to need a bridge again. */}
      </SectionShell>
    </ScrollReveal>
  );
}
