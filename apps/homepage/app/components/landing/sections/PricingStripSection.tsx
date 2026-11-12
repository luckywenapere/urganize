import { VisitorPrice } from "@/app/components/pricing/VisitorPrice";
import { salesMailto } from "@/lib/sales-mailto";
import { PlanPicker } from "../PlanPicker";
import {
  formatTierFromPrice,
  formatTierPrice,
  getTier,
  PRICING_TIER_ORDER,
  tierHighlights,
} from "@urganize/pricing";
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
  // FIVE cards since 2026-11-09, when the founder removed Free: Solo, Solo
  // Plus, Pro (id manager), Pro Plus (id pro) and Label. Six (with Free) from
  // pricing v4 on 2026-11-08. Before that, four
  // cards since 2026-11-07 (#1112): Solo, Manager, Pro and Label. No
  // first-month price any more. Label is a custom deal, so it shows its
  // "Custom", never a price (#1120). Prices show in the visitor's currency.
  const tiers = PRICING_TIER_ORDER.map((id) => {
    const tier = getTier(id);
    return {
      id,
      tier,
      price: tier.contactSales ? formatTierFromPrice(id) : formatTierPrice(id),
      highlights: tierHighlights(id).slice(0, 3),
      // What the plan does for the team (#1063, the 3 Nov positioning), read
      // from @urganize/pricing like /pricing and the sign-in page.
      outcomeHeading: tier.outcomeHeading ?? null,
      outcomes: tier.outcomes ?? [],
    };
  });

  const firstPaid = tiers.find(({ tier }) => !tier.contactSales && (tier.monthlyPrice?.amount ?? 0) > 0);

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
          {/* "From" is the cheapest paid plan. */}
          {firstPaid?.price ? (
            <p className="mx-auto mt-5 max-w-[36rem] text-[1.05rem] leading-8 text-[var(--marketing-text-muted)] sm:text-[1.15rem]">
              Plans from <VisitorPrice tierId={firstPaid.id} />. Pick the one that fits you.
            </p>
          ) : null}
        </div>

        {/* Two taps to the plan that fits (#1220, from the Coframe review). */}
        <PlanPicker />

        {/* Solo, Manager, Pro and Label (from a starting price) since
            2026-11-07. One column on a phone, two from md, four from xl. */}
        <ul className="mx-auto mt-12 grid max-w-[76rem] gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tiers.map(({ id, tier, price, highlights, outcomeHeading, outcomes }) => (
            <li
              key={id}
              // Label spans two columns (#1220): five cards in a three-column
              // grid left an empty slot beside it, which read as a missing plan.
              className={`flex h-full flex-col rounded-[1.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-5 sm:p-6 ${tier.contactSales ? "md:col-span-2" : ""}`}
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
              <p className="mt-4 text-[1.6rem] font-semibold tracking-[-0.03em] text-[var(--marketing-text)] sm:mt-5 sm:text-[1.75rem]">
                <VisitorPrice tierId={id} fallback={price ?? "Let’s talk"} />
              </p>
              {outcomeHeading ? (
                <>
                  <p className="mt-4 text-sm font-semibold text-[var(--marketing-text)] sm:mt-5">{outcomeHeading}</p>
                  <ul className="mt-2 space-y-1 sm:space-y-2">
                    {outcomes.map((line) => (
                      <li
                        key={line}
                        className="flex items-baseline gap-3 text-[0.95rem] leading-7 text-[var(--marketing-text)]"
                      >
                        <span
                          className="font-mono text-[0.72rem] text-[var(--marketing-accent)]"
                          aria-hidden
                        >
                          ·
                        </span>
                        {line}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <ul className="mt-4 space-y-1 border-t border-[var(--marketing-border)] pt-4 sm:mt-5 sm:space-y-2 sm:pt-5">
                {highlights.map((line) => (
                  <li
                    key={line}
                    className="flex items-baseline gap-3 text-[0.95rem] leading-7 text-[var(--marketing-text)]"
                  >
                    <span
                      className="font-mono text-[0.72rem] text-[var(--marketing-accent)]"
                      aria-hidden
                    >
                      ·
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              {/* The Label card is a custom deal, so it had no price to act on
                  and no button: a label buyer had nowhere to go (#1217, from
                  the Coframe review). The self-serve cards keep the page's own
                  "Create your account" ask; only Label gets a contact button,
                  the same mailto /pricing's Label card opens. */}
              {tier.contactSales ? (
                <div className="mt-auto pt-6">
                  <a
                    href={salesMailto(tier.label)}
                    data-track="pricing_contact_clicked"
                    data-plan={id}
                    data-location="home_pricing"
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--marketing-border)] px-5 py-2.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text)] transition-colors hover:bg-[var(--marketing-surface)]"
                  >
                    Talk to us
                  </a>
                </div>
              ) : null}
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
