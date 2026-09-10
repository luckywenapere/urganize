import {
  formatTierPrice,
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
// here is RENDERED from @urganize/pricing: the tier order, the labels, the
// audience lines, the price, and the first three highlight lines, which carry
// the seat and artist ceilings so nobody meets a wall the page never mentioned.
// Nothing is typed here: this repo has shipped a page quoting one figure while
// checkout charged another four separate times.
//
// ANNUAL ONLY since 2026-09-08. This showed the MONTHLY figure with the annual
// saving as a line underneath; there is one price now and it is a year, so the
// saving line went with the comparison it described.
//
// Server component and always was, so `/` stays static. The full ladder lives
// on /pricing; this is the teaser. (There was a Group conversation to point at
// too, briefly — removed 2026-09-09, see @urganize/pricing.)
export function PricingStripSection() {
  const tiers = PRICING_TIER_ORDER.map((id) => {
    const tier = getTier(id);
    return {
      id,
      tier,
      price: formatTierPrice(id),
      highlights: tierHighlights(id).slice(0, 3),
    };
  });

  return (
    <ScrollReveal>
      <SectionShell
        className="py-[80px] lg:py-[100px]"
        containerClassName={wideContainerClass}
      >
        <div className="mx-auto max-w-[52rem] text-center">
          <h2 className={centeredHeadlineClass}>One price for your team.</h2>
          <p className="mt-5 text-base leading-8 text-[var(--marketing-text-muted)] sm:text-[1.05rem]">
            Not per person, and paid once a year. Start free for 3 days, then
            pick the plan that fits how many artists you run.
          </p>
        </div>

        {/* THREE since 2026-09-09 (Group, the fourth, was removed the day after
            it came back onto the ladder). One column below md, three from md —
            the same breakpoint /pricing's own three-card layout uses. */}
        <ul className="mx-auto mt-12 grid max-w-[56rem] gap-4 md:grid-cols-3">
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
          <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
            {FOUNDING_MEMBER_LINE}
          </p>
          <p className="mono-label mt-6 text-[var(--marketing-text-subtle)]">
            Prices in Naira · Paid once a year · Export your data any time
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
