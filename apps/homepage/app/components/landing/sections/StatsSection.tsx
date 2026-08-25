import type { IconType } from "react-icons";
import {
  RiCalendarCheckLine,
  RiStackLine,
  RiVipCrownLine,
} from "react-icons/ri";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass } from "./shared";

// Stat cards restored 2026-08-25 on the founder's own figures — the same day
// the previous proof-number beats were cut from WorkspaceShot and FinalCTA
// with "do not restore without fresh founder-supplied figures". These ARE
// those fresh figures: not measured claims, but the shape of the offer
// (one workspace, the 14-day team trial, the Founding Member cap). If any
// stops being true, remove its card rather than soften its wording.
const stats: Array<{
  figure: string;
  body: string;
  Icon: IconType;
}> = [
  {
    figure: "1 workspace",
    body: "All artists, releases and tasks in one place",
    Icon: RiStackLine,
  },
  {
    figure: "14 days free",
    body: "Full access, no card required to start",
    Icon: RiCalendarCheckLine,
  },
  {
    figure: "10 lifetime spots",
    body: "Founding Member price lock, never changes",
    Icon: RiVipCrownLine,
  },
];

export function StatsSection() {
  return (
    <ScrollReveal>
      {/* Tight beat (WorkspaceShot's padding, not the default py-32): the
          hero above already ends on pb-20/28 under the video, so a full-size
          section gap here would open a ~250px void between the video and
          these cards. */}
      <SectionShell
        className="py-[60px] lg:py-[80px]"
        containerClassName="max-w-[74rem] px-6 sm:px-8 lg:px-10"
      >
        <div className="mx-auto max-w-[52rem] text-center">
          <p className="mono-label text-[var(--marketing-text-subtle)]">
            What you get
          </p>
          <h2 className={`mt-6 ${centeredHeadlineClass}`}>
            Built to move faster
          </h2>
        </div>

        {/* rounded-[1.5rem] bordered cards: the PricingTierCards treatment —
            the one true card pattern on the marketing site. One green accent
            only; no per-card tints. */}
        <div className="mx-auto mt-14 grid max-w-[64rem] gap-6 md:grid-cols-3">
          {stats.map(({ figure, body, Icon }) => (
            <div
              key={figure}
              className="flex flex-col items-center rounded-[1.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-8 text-center"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-[var(--marketing-accent)]/10 text-[var(--marketing-accent)]">
                <Icon aria-hidden size={22} />
              </span>
              <p className="mt-6 text-3xl font-black tracking-tighter text-[var(--marketing-accent)] sm:text-4xl">
                {figure}
              </p>
              <p className="mt-3 max-w-[18rem] text-balance text-base leading-7 text-[var(--marketing-text-muted)]">
                {body}
              </p>
            </div>
          ))}
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
