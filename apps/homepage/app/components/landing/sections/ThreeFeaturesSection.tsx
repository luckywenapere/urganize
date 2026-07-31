import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { wideContainerClass } from "./shared";

const featureColumns = [
  {
    kicker: "Workflow",
    title: "Release tasks, assigned.",
    body: "Every step from master lock to release day, owned by a person with a due date. No more 'who's doing the art again?'",
  },
  {
    kicker: "Assets",
    title: "Every file, filed.",
    body: "Masters, artwork, contracts, and split sheets, attached to the release they belong to. No more 'Final v3 ACTUAL final' buried in Drive.",
  },
  {
    kicker: "Visibility",
    title: "Status at a glance.",
    body: "One workspace shows every release in flight: what's done, what's blocked, what's due this week. Spot what's slipping before it hurts the rollout.",
  },
] as const;

export function ThreeFeaturesSection() {
  return (
    <ScrollReveal>
      <SectionShell containerClassName={wideContainerClass}>
        <div className="grid divide-y divide-[color:var(--marketing-border)] border-y border-[color:var(--marketing-border)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {featureColumns.map((feature) => (
            <div key={feature.title} className="py-10 lg:px-10 lg:py-14">
              <p className="mono-label text-[var(--marketing-accent)]">
                {feature.kicker}
              </p>
              <h3 className="mt-5 text-balance text-[2.15rem] font-semibold leading-[1.04] tracking-[-0.045em] text-[var(--marketing-text)] sm:text-[2.6rem]">
                {feature.title}
              </h3>
              <p className="mt-5 max-w-[24rem] text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
                {feature.body}
              </p>
            </div>
          ))}
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
