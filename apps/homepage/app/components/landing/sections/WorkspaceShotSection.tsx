import Image from "next/image";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { wideContainerClass } from "./shared";

// Real screenshot of the current workspace (retaken 2026-07-25 after the
// catalog/focused-view redesign). If the UI changes meaningfully, retake
// this — never let marketing imagery lag the product again.
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
          <Image
            src="/images/product/workspace-releases.png"
            alt="The Urganize catalog: four releases across three artists, each with cover art, a release date, and a progress bar for its 64-task plan."
            width={1920}
            height={970}
            className="h-auto w-full"
            sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
          />
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
