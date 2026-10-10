import { PRODUCT_SHOTS } from "@/content/product-shots";
import { ResponsiveProductShot } from "../ResponsiveProductShot";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { wideContainerClass } from "./shared";

// Real screenshot of the current catalog. Since 2026-09-02 the files are
// written by scripts/capture-product-shots.mjs (`pnpm --filter
// @urganize/homepage shots`), light and dark from the same DOM, so the shot
// follows the site's theme toggle cleanly and retaking is one command when
// the UI changes — never let marketing imagery lag the product again. The
// homepage hero uses the same pair (HeroSection, since 2026-09-02); this mount
// serves the four persona pages.
//
// 2026-10-10: it reads PRODUCT_SHOTS.catalog and catalogPhone directly, the
// way the hero does, instead of the `workspace-releases` files. Those are
// byte-identical legacy copies the script still writes for old URLs, and they
// had no phone version, so a phone got the 1920px desktop capture at 0.18x,
// unreadable. Below sm it is now the phone capture in a 4:5 window onto its
// top, exactly as in the hero.
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
        <div className="aspect-[4/5] overflow-hidden rounded-xl border border-[color:var(--marketing-border)] sm:aspect-auto">
          <ResponsiveProductShot
            desktop={PRODUCT_SHOTS.catalog}
            phone={PRODUCT_SHOTS.catalogPhone}
            alt="The Urganize catalog for a team running several artists: a grid of release cards, each with cover art, a release date and a progress bar counting finished activities against its plan."
            sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
            className="h-full w-full object-cover object-top sm:h-auto sm:object-contain"
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
