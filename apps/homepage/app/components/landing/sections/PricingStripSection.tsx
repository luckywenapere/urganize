import {
  annualSavingCopy,
  formatTierCyclePrice,
  getTier,
  PRICING_TIER_ORDER,
  tierHighlights,
} from "@urganize/pricing";
import { FOUNDING_MEMBER_LINE } from "@/content/founding-member";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { TrialButton } from "../TrialButton";
import { centeredHeadlineClass, wideContainerClass } from "./shared";

// Transparent pricing on the homepage (2026-09-02). Self-serve pages that
// show the price convert better than pages that hide it, and every figure
// here is RENDERED from @urganize/pricing — the tier order, the labels, the
// audience lines, the monthly price, the first three highlight lines (which
// carry the seat and artist ceilings, so nobody meets a wall the page never
// mentioned) and the annual saving, phrased the one way the package allows.
// Nothing is typed here: this repo has shipped a page quoting one figure
// while checkout charged another four separate times.
//
// Server component with no interval toggle, so `/` stays static. Full
// pricing, the annual toggle and the Label conversation live on /pricing.
// Group is absent by design: it left the display ladder on 2026-08-30.
export function PricingStripSection() {
  const tiers = PRICING_TIER_ORDER.map((id) => {
    const tier = getTier(id);
    return {
      id,
      tier,
      price: formatTierCyclePrice(id, "monthly"),
      highlights: tierHighlights(id).slice(0, 3),
    };
  });
  const firstPriced = tiers.find((entry) => entry.price)?.id;
  const saving = firstPriced ? annualSavingCopy(firstPriced) : null;

  return (
    <ScrollReveal>
      <SectionShell
        className="py-[80px] lg:py-[100px]"
        containerClassName={wideContainerClass}
      >
        <div className="mx-auto max-w-[52rem] text-center">
          <h2 className={centeredHeadlineClass}>One price for your team.</h2>
          <p className="mt-5 text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
            Not per person. Start free for 14 days, then pick the plan that
            fits how many artists you run.
          </p>
        </div>

        <ul className="mx-auto mt-12 grid max-w-[64rem] gap-4 md:grid-cols-3">
          {tiers.map(({ id, tier, price, highlights }) => (
            <li
              key={id}
              className={`flex h-full flex-col rounded-[1.5rem] border p-6 ${
                tier.recommended
                  ? "border-[var(--marketing-accent)]/50 bg-[var(--marketing-accent)]/[0.06]"
                  : "border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                  {tier.label}
                </p>
                {tier.recommended ? (
                  <span className="rounded-full bg-[var(--marketing-accent)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--marketing-accent)]">
                    Most teams
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--marketing-text-muted)]">
                {tier.audience}
              </p>
              <p className="mt-5 text-[1.75rem] font-semibold tracking-[-0.03em] text-[var(--marketing-text)]">
                {price ?? "Let’s talk"}
              </p>
              <ul className="mt-5 space-y-2">
                {highlights.map((line) => (
                  <li
                    key={line}
                    className="flex items-baseline gap-3 text-[0.95rem] leading-7 text-[var(--marketing-text)]"
                  >
                    <span
                      className="font-mono text-[0.72rem] text-[var(--marketing-accent)]"
                      aria-hidden
                    >
                      —
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-8 max-w-[64rem] text-center">
          {saving ? (
            <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
              Pay for the year and get {saving}.
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-6 text-[var(--marketing-text-muted)]">
            {FOUNDING_MEMBER_LINE}
          </p>
          <p className="mono-label mt-6 text-[var(--marketing-text-subtle)]">
            Prices in Naira · No card · Export your data any time
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <TrialButton location="pricing" />
            <a
              href="/pricing"
              className="text-sm font-medium text-[var(--marketing-text)] underline decoration-[color:var(--marketing-text-subtle)] underline-offset-4 transition-colors hover:decoration-[color:var(--marketing-text)]"
            >
              See full pricing →
            </a>
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
