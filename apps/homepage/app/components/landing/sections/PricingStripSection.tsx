import {
  formatTierPrice,
  getTier,
  PRICING_TIER_ORDER,
  tierHighlights,
} from "@urganize/pricing";
import { salesMailto } from "@/lib/sales-mailto";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass, wideContainerClass } from "./shared";

// Transparent pricing on the homepage (2026-09-02). Self-serve pages that
// show the price convert better than pages that hide it, and every figure
// here is RENDERED from @urganize/pricing: the tier order, the labels, the
// audience lines, the price, and the first three highlight lines, which carry
// the seat and artist ceilings so nobody meets a wall the page never mentioned.
// Nothing is typed here: this repo has shipped a page quoting one figure while
// checkout charged another four separate times.
//
// MONTHLY AGAIN since 2026-09-10, when both intervals went back on sale. This
// showed a monthly figure before 2026-09-08, a yearly one between then and now,
// and a monthly one again — always by calling `formatTierPrice` and never by
// naming an interval, which is why the swap costs nothing here.
//
// It takes the DEFAULT interval deliberately rather than offering a toggle: this
// is the teaser, and the smaller number is the one that earns a click through to
// /pricing, where the full comparison and the saving badge live.
//
// Server component and always was, so `/` stays static. The full ladder lives
// on /pricing; this is the teaser. (There was a Group conversation to point at
// too from 2026-09-08 to 2026-09-09, and again since 2026-10-02: Group, the
// fourth card, with "Let's talk" in place of a price.)
export function PricingStripSection() {
  // HOMEPAGE V2 (2026-10-17, URG-334): the three priced tiers only. Group
  // ("Let's talk") is a text link under the cards, since a fourth equal card is
  // one more choice on a page where nobody can buy yet. This reverses the
  // 2026-10-02 four-card call on the homepage only; /pricing keeps all four.
  const tiers = PRICING_TIER_ORDER.filter((id) => formatTierPrice(id) !== null).map((id) => {
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
        className="py-[72px] lg:py-[96px]"
        containerClassName={wideContainerClass}
      >
        <div className="mx-auto max-w-[52rem] text-center">
          {/* 2026-10-19 (founder approved, loss framing): the price sits
              against the cost of one missed deadline. The "from" figure is
              the first priced tier, rendered from @urganize/pricing like the
              cards, never typed. */}
          <h2 className={centeredHeadlineClass}>Cheaper than one missed deadline.</h2>
          {tiers[0]?.price ? (
            <p className="mx-auto mt-5 max-w-[36rem] text-[1.05rem] leading-8 text-[var(--marketing-text-muted)] sm:text-[1.15rem]">
              From {tiers[0].price}. Pick the plan that fits your roster.
            </p>
          ) : null}
        </div>

        {/* FOUR since 2026-10-02 (Group came back as the "Let's talk" card).
            One column on a phone, two from sm, four from xl — the same
            breakpoints /pricing's own cards use. */}
        <ul className="mx-auto mt-12 grid max-w-[60rem] gap-4 md:grid-cols-3">
          {tiers.map(({ id, tier, price, highlights }) => (
            <li
              key={id}
              className="flex h-full flex-col rounded-[1.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-5 sm:p-6"
            >
              {/* No badge and no elevation — every card here is identical, and
                  `tier.recommended` is not read on this surface. Both went on
                  2026-09-11 (founder call); the full reasoning, including why
                  the flag is still live for the in-app wall, is in the note in
                  PricingTierCards. */}
              <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                {tier.label}
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--marketing-text-muted)]">
                {tier.audience}
              </p>
              <p className="mt-4 text-[1.6rem] font-semibold sm:mt-5 sm:text-[1.75rem] tracking-[-0.03em] text-[var(--marketing-text)]">
                {price ?? "Let’s talk"}
              </p>
              <ul className="mt-4 space-y-1 sm:mt-5 sm:space-y-2">
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

        {/* The Founding Member line, the naira/interval/export label and the
            "Not per person…" explainer above were all removed on a founder
            call (2026-09-11): the strip is the tiers and the ask now, and
            /pricing carries the detail. FOUNDING_MEMBER_LINE still exists and
            still renders THERE — see content/founding-member.ts, which is why
            this no longer imports it. */}
        <div className="mx-auto mt-10 flex max-w-[64rem] flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium">
            <a
              href={salesMailto("Group")}
              className="text-[var(--marketing-text-muted)] underline decoration-[color:var(--marketing-text-subtle)] underline-offset-4 transition-colors hover:text-[var(--marketing-text)]"
            >
              Bigger team? Let&rsquo;s talk
            </a>
            <a
              href="/pricing"
              className="text-[var(--marketing-text)] underline decoration-[color:var(--marketing-text-subtle)] underline-offset-4 transition-colors hover:decoration-[color:var(--marketing-text)]"
            >
              See full pricing →
            </a>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
