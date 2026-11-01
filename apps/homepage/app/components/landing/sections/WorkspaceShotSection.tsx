import type { ProductShot } from "@/content/product-shots";
import { ResponsiveProductShot } from "../ResponsiveProductShot";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { wideContainerClass } from "./shared";

// The roster still (#955, mock approved by the founder 2026-11-01). The hero
// already shows the catalog, so this beat shows the roster instead: four
// artists at four stages, with one release (Harmattan Gold) opened in place
// with its stages and next move. It serves the four persona pages.
//
// It is a drawn picture, not a capture: the Current rollout and Stage columns
// do not exist on the Artists page today, so there is no live screen to
// photograph. Demo team Northline Music with made-up artists, drawn in the
// app's light and dark tokens so it follows the site's theme toggle. Below sm
// it is the phone drawing; from sm up the wide one (ResponsiveProductShot
// picks one per theme). If the Artists page changes, redraw all four.
const workspaceRoster: ProductShot = {
  light: "/images/product/workspace-roster.webp",
  dark: "/images/product/workspace-roster-dark.webp",
  width: 2200,
  height: 1240,
};
const workspaceRosterPhone: ProductShot = {
  light: "/images/product/workspace-roster-phone.webp",
  dark: "/images/product/workspace-roster-phone-dark.webp",
  width: 716,
  height: 896,
};

export function WorkspaceShotSection() {
  return (
    <ScrollReveal>
      <SectionShell
        containerClassName={wideContainerClass}
        className="py-[80px] lg:py-[100px]"
      >
        {/* The proof-numbers line that used to sit here ("7 founding teams,
            10 artists and 2 rollouts running right now. Live since January
            2026.") was REMOVED 2026-08-25 on the founder's call, in the same
            pass that cut the row titles from TransformationSection (itself
            removed 2026-08-25). The
            screenshot is the proof this beat needs; a small-numbers boast
            was doing the opposite of persuading. Do not restore it without
            a fresh founder-supplied count — the numbers here were only ever
            true as of the 2026-08 brief. The /pricing Founding Member claim
            and FinalCTASection's 43% line are separate and untouched. */}
        <div className="mx-auto max-w-[24rem] overflow-hidden rounded-xl border border-[color:var(--marketing-border)] sm:max-w-none">
          <ResponsiveProductShot
            desktop={workspaceRoster}
            phone={workspaceRosterPhone}
            alt="The Urganize Artists page for Northline Music: several artists, each with a current rollout at a different stage, and Harmattan Gold by Kanmi Gold opened in place with its pre-release, release and post-release progress and its next task."
            sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
            className="h-auto w-full"
            fetchPriority="auto"
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
