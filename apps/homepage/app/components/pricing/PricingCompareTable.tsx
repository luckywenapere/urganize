import { RiCheckLine, RiCloseLine } from "react-icons/ri";
import {
  DISTRIBUTION_ALLOWANCE,
  PRICING_TIER_ORDER,
  formatTierFromPrice,
  formatTierPrice,
  getTier,
  type BillingInterval,
  type PricingTierId,
} from "@urganize/pricing";

// "Compare all features" (founder, 2026-11-07, #1112).
//
// EVERY NUMBER COMES FROM @urganize/pricing: prices, limits, credits, the
// distribution allowance and the per-single price. Nothing countable is typed
// here, so a reprice or a re-cut tier moves this table with the cards.
//
// Distribution follows TRM's rules (2026-11-07): a single can be paid for one
// at a time; an EP needs a monthly TRM plan and an album a yearly one. Pro and
// Label include the TRM plan that matches how the team pays us.
//
// On a phone the table scrolls sideways inside its own box, with the feature
// names pinned on the left, so the page itself never scrolls sideways.

type Cell = string | boolean;
type Row = { label: string; value: (tier: PricingTierId, interval: BillingInterval) => Cell };
type Group = { title: string; rows: Row[] };

const includesDistribution = (tier: PricingTierId) => getTier(tier).includesDistribution;

/** "3", "Unlimited". */
const count = (value: number | null) => (value === null ? "Unlimited" : value.toLocaleString("en-US"));

const SUPPORT: Record<PricingTierId, string> = {
  solo: "Help centre",
  manager: "Email",
  pro: "Priority email",
  label: "Same-day WhatsApp",
  enterprise: "Same-day WhatsApp",
};

const GROUPS: Group[] = [
  {
    title: "Plan",
    rows: [
      {
        label: "Price",
        value: (tier, interval) =>
          getTier(tier).contactSales ? (formatTierFromPrice(tier, interval) ?? "Let's talk") : (formatTierPrice(tier, interval) ?? ""),
      },
      { label: "Artists", value: (tier) => count(getTier(tier).limits.artists) },
      { label: "People on your team", value: (tier) => count(getTier(tier).limits.seats) },
      { label: "Rollouts at a time", value: (tier) => count(getTier(tier).limits.activeReleases) },
    ],
  },
  {
    title: "Plan and run every rollout",
    rows: [
      { label: "AI-built rollout plan", value: () => true },
      { label: "Timeline and tasks", value: () => true },
      { label: "Brief board and idea round", value: () => true },
      { label: "Share a brief with 5 guests", value: () => true },
    ],
  },
  {
    title: "AI",
    rows: [
      { label: "AI credits a month", value: (tier) => getTier(tier).urgansMonthlyCredits.toLocaleString("en-US") },
      { label: "Chat, voice and saved chats", value: () => true },
      { label: "AI that makes changes for you", value: (tier) => tier !== "solo" },
      { label: "WhatsApp reminders", value: (tier) => tier !== "solo" },
    ],
  },
  {
    title: "Get it out",
    rows: [
      { label: "Release details, cover art and song credits", value: () => true },
      { label: "Smart link", value: () => true },
      { label: "Press kit and pitch kit", value: () => true },
      { label: "Pitch to playlists", value: () => "Credits per pitch" },
      { label: "Share to socials", value: () => true },
    ],
  },
  {
    title: "Send to stores",
    rows: [
      {
        label: "Singles",
        value: (tier) => (includesDistribution(tier) ? "Included" : "From your own TRM account"),
      },
      {
        label: "EPs",
        value: () => "Coming soon",
      },
      {
        label: "Albums",
        value: () => "Coming soon",
      },
      {
        label: "Artists we send for",
        value: (tier) => {
          const allowance = DISTRIBUTION_ALLOWANCE[tier];
          return allowance ? allowance.artists.toLocaleString("en-US") : "None";
        },
      },
      {
        label: "Releases included a month",
        value: (tier) => {
          const allowance = DISTRIBUTION_ALLOWANCE[tier];
          return allowance ? allowance.releasesPerMonth.toLocaleString("en-US") : "None";
        },
      },
    ],
  },
  {
    title: "Team and help",
    rows: [
      { label: "Urganize directory", value: () => true },
      { label: "Support", value: (tier) => SUPPORT[tier] },
      { label: "We set your roster up with you", value: (tier) => tier === "label" },
    ],
  },
];

function CellValue({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <RiCheckLine className="mx-auto size-5 text-[var(--marketing-accent)]" aria-hidden="true" />
        <span className="sr-only">Yes</span>
      </>
    );
  }
  if (value === false) {
    return (
      <>
        <RiCloseLine className="mx-auto size-5 text-[var(--marketing-text-subtle)]" aria-hidden="true" />
        <span className="sr-only">No</span>
      </>
    );
  }
  return <span>{value}</span>;
}

export function PricingCompareTable({ interval }: { interval: BillingInterval }) {
  const tiers = PRICING_TIER_ORDER;
  return (
    <div className="mx-auto mt-16 max-w-6xl">
      <h2 className="text-center text-2xl md:text-3xl">Compare all features</h2>
      <div className="mt-8 overflow-x-auto rounded-[1.25rem] border border-[var(--marketing-border)]">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[var(--marketing-surface-muted)]">
              <th
                scope="col"
                className="sticky left-0 z-10 w-[36%] bg-[var(--marketing-surface-muted)] px-4 py-3 font-medium text-[var(--marketing-text-subtle)]"
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
          {GROUPS.map((group) => (
            <tbody key={group.title}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={tiers.length + 1}
                  className="sticky left-0 bg-[var(--marketing-bg)] px-4 pb-2 pt-6 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--marketing-text)]"
                >
                  {group.title}
                </th>
              </tr>
              {group.rows.map((row) => (
                <tr key={row.label} className="border-t border-[var(--marketing-border)]">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-[var(--marketing-bg)] px-4 py-3 font-normal text-[var(--marketing-text-muted)]"
                  >
                    {row.label}
                  </th>
                  {tiers.map((tier) => (
                    <td key={tier} className="px-3 py-3 text-center text-[var(--marketing-text)]">
                      <CellValue value={row.value(tier, interval)} />
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
