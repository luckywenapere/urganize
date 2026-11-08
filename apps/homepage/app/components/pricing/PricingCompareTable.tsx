import {
  TIER_GROUPS,
  TIER_GROUP_LABEL,
  TIER_SUPPORT,
  getTier,
  tierStoresCell,
  type PricingCurrencyCode,
  type PricingTierId,
  type TierGroupId,
} from "@urganize/pricing";

// "Compare plans", one table per side of the switch (pricing v4, founder mock
// 2026-11-08, docs/mocks/pricing-v4/mock.html).
//
// EVERY NUMBER COMES FROM @urganize/pricing: limits, credits and how music
// reaches the stores. Rows the mock marked "Soon" (briefs, WhatsApp chasing,
// routines, research lookups, talking to other teams, the best AI model) are not
// built and are not here. Curator pitch quotas are not here either: pitching is
// paid per pitch in credits, and no plan has a pitch quota in the product.
//
// On a phone the table scrolls sideways inside its own box, with the row names
// pinned on the left, so the page itself never scrolls sideways.

type Row = { label: string; value: (tier: PricingTierId, currency: PricingCurrencyCode) => string };
type Group = { title: string; rows: Row[] };

/** "3", "Unlimited". */
const count = (value: number | null) => (value === null ? "Unlimited" : value.toLocaleString("en-US"));

const GROUPS: Group[] = [
  {
    title: "Size",
    rows: [
      { label: "Artists", value: (tier) => count(getTier(tier).limits.artists) },
      { label: "People", value: (tier) => count(getTier(tier).limits.seats) },
      { label: "Rollouts at once", value: (tier) => count(getTier(tier).limits.activeReleases) },
    ],
  },
  {
    title: "AI",
    rows: [
      { label: "AI credits a month", value: (tier) => getTier(tier).urgansMonthlyCredits.toLocaleString("en-US") },
      // Only a paying team can go past its credits (overage, apps/web).
      { label: "Keep going past your credits", value: (tier) => (tier === "free" ? "No" : "Yes, with a limit") },
    ],
  },
  {
    title: "Your releases",
    rows: [
      { label: "Send to stores", value: (tier, currency) => tierStoresCell(tier, currency) },
      { label: "Help", value: (tier) => TIER_SUPPORT[tier] },
    ],
  },
];

export function PricingCompareTable({
  group,
  currency = "NGN",
}: {
  group: TierGroupId;
  currency?: PricingCurrencyCode;
}) {
  const tiers = TIER_GROUPS[group];
  return (
    <div className="mx-auto mt-16 max-w-4xl">
      <h2 className="text-center text-2xl md:text-3xl">Compare plans</h2>
      <p className="mt-2 text-center text-sm text-[var(--marketing-text-muted)]">
        Showing the plans for {TIER_GROUP_LABEL[group].toLowerCase()}.
      </p>
      <div className="mt-8 overflow-x-auto rounded-[1.25rem] border border-[var(--marketing-border)]">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[var(--marketing-surface-muted)]">
              <th
                scope="col"
                className="sticky left-0 z-10 w-[34%] bg-[var(--marketing-surface-muted)] px-4 py-3 font-medium text-[var(--marketing-text-subtle)]"
              >
                <span className="sr-only">Feature</span>
              </th>
              {tiers.map((tier) => (
                <th
                  key={tier}
                  scope="col"
                  className="px-3 py-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-[var(--marketing-accent)]"
                >
                  {getTier(tier).label}
                </th>
              ))}
            </tr>
          </thead>
          {GROUPS.map((section) => (
            <tbody key={section.title}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={tiers.length + 1}
                  className="sticky left-0 bg-[var(--marketing-bg)] px-4 pb-2 pt-6 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--marketing-text)]"
                >
                  {section.title}
                </th>
              </tr>
              {section.rows.map((row) => (
                <tr key={row.label} className="border-t border-[var(--marketing-border)]">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--marketing-bg)] px-4 py-3 font-normal text-[var(--marketing-text-muted)]"
                  >
                    {row.label}
                  </th>
                  {tiers.map((tier) => (
                    <td key={tier} className="px-3 py-3 text-center text-[var(--marketing-text)]">
                      {row.value(tier, currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
}
