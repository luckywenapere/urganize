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
        className="py-[60px] lg:py-[80px]"
      >
        <p className="mono-label mb-10 text-center text-[var(--marketing-text-subtle)]">
          Live since January 2026
        </p>
        <div className="overflow-hidden rounded-xl border border-[color:var(--marketing-border)]">
          <ThemedProductShot
            light="/images/product/workspace-releases.png"
            dark="/images/product/workspace-releases-dark.png"
            alt="The Urganize catalog: a grid of release cards, each with cover art, a release date, and a progress bar counting finished activities against its 64-activity plan. The top row runs from 0 of 64 done to 30 of 64."
            width={1920}
            height={970}
            sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
          />
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
