"use client";

import { useState } from "react";
import { RiCheckLine } from "react-icons/ri";
import {
  ADDON_PRICES_NAIRA,
  CREDIT_OVERAGE_NAIRA,
  CREDIT_PACK_USD,
  DEFAULT_SELLING_INTERVAL,
  PRICING_TIERS,
  SELLABLE_INTERVALS,
  TIER_GROUPS,
  TIER_GROUP_HINT,
  TIER_GROUP_LABEL,
  TIER_GROUP_ORDER,
  annualSavingCopy,
  canBuyAddon,
  formatMoney,
  formatTierFromPrice,
  getTier,
  getTierPriceIn,
  isSelfServePurchase,
  tierFeatures,
  type BillingInterval,
  type PricingCurrencyCode,
  type PricingTierId,
  type TierGroupId,
} from "@urganize/pricing";
import { useVisitorCurrency } from "@/lib/visitor-currency";
import { APP_ORIGIN } from "@/lib/app-urls";
import { salesMailto } from "@/lib/sales-mailto";
import { PricingCompareTable } from "./PricingCompareTable";

// The price table, PRICING V4 (founder-approved mock, 2026-11-08, #1112,
// docs/mocks/pricing-v4/mock.html).
//
// Five plans in two groups behind a "Just you | Your team" switch: Solo and
// Solo Plus for an artist working alone; Pro, Pro Plus and Label for a team.
// (Free led the first side from 2026-11-08 until the founder removed it on
// 2026-11-09.) Pro is the code id `manager` and Pro Plus is `pro`: only the names on
// screen moved, so payments and stored plans did not.
//
// EVERY NUMBER COMES FROM @urganize/pricing (prices, limits, credits, the
// distribution allowance), so this page cannot advertise a ceiling the app does
// not apply. Lines the mock marked "Soon" are not built and are not shown.
//
// Solo, Solo Plus, Pro and Pro Plus go to checkout for that plan and period. Label is a custom deal and its
// button emails us.

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: "Monthly",
  semiannual: "6 months",
  annual: "Yearly",
};

const money = (amount: number, currency: PricingCurrencyCode) => formatMoney(amount, currency);

/** The big figure, its unit, and the line under it, for one card. */
function cardPrice(
  tierId: PricingTierId,
  interval: BillingInterval,
  currency: PricingCurrencyCode
): { figure: string; unit: string | null; sub: string | null } {
  if (getTier(tierId).contactSales) {
    // "Custom", with the Naira starting price for a visitor paying in Naira.
    const from = PRICING_TIERS[tierId].monthlyPrice;
    return {
      figure: formatTierFromPrice(tierId, interval) ?? "Let's talk",
      unit: null,
      sub: currency === "NGN" && from ? `From ${money(from.amount, "NGN")}/month, priced with you` : "Priced with you",
    };
  }
  if (interval === "monthly") {
    const monthly = getTierPriceIn(tierId, "monthly", currency);
    const yearly = getTierPriceIn(tierId, "annual", currency);
    return {
      figure: monthly ? money(monthly.amount, currency) : "",
      unit: "/month",
      sub: yearly ? `Or ${money(yearly.amount, currency)} a year, ${annualSavingCopy(tierId) ?? ""}`.replace(/, $/, "") : null,
    };
  }
  const yearly = getTierPriceIn(tierId, interval, currency);
  if (!yearly) return { figure: "", unit: null, sub: null };
  return {
    figure: money(yearly.amount, currency),
    unit: "/year",
    sub: `Works out to ${money(Math.round(yearly.amount / 12), currency)} a month`,
  };
}

/** The one plan per side that carries "Most ..." on the mock. */
const BADGE: Partial<Record<PricingTierId, string>> = {
  solo: "Most artists",
  manager: "Most managers",
};

export function PricingTierCards() {
  const [group, setGroup] = useState<TierGroupId>("you");
  const [interval, setInterval] = useState<BillingInterval>(DEFAULT_SELLING_INTERVAL);
  const currency = useVisitorCurrency();
  // "2 months free", from the same constant that computes the yearly price.
  const yearlySaving = annualSavingCopy("solo");
  const tiers = TIER_GROUPS[group];

  return (
    <section data-visitor-price className="relative px-6 pb-20">
      <div className="mx-auto max-w-6xl">
        {/* Who it is for first, then how often you pay: both reprice the cards. */}
        <div className="mb-3 flex justify-center">
          <div
            role="group"
            aria-label="Who the plans are for"
            className="inline-flex overflow-hidden rounded-full border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-1"
          >
            {TIER_GROUP_ORDER.map((option) => {
              const isActive = group === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setGroup(option)}
                  data-track="pricing_group_switched"
                  data-group={option}
                  className={`rounded-full px-5 py-2 text-sm font-medium tracking-[-0.01em] transition-colors ${
                    isActive
                      ? "bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)]"
                      : "text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]"
                  }`}
                >
                  {TIER_GROUP_LABEL[option]}
                </button>
              );
            })}
          </div>
        </div>
        <p className="mb-6 text-center text-sm text-[var(--marketing-text-muted)]" aria-live="polite">
          {TIER_GROUP_HINT[group]}
        </p>

        <div className="mb-10 flex justify-center">
          <div
            role="radiogroup"
            aria-label="Choose how often you pay"
            className="inline-flex overflow-hidden rounded-full border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-1"
          >
            {SELLABLE_INTERVALS.map((option) => {
              const isActive = interval === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setInterval(option)}
                  className={`rounded-full px-5 py-2 text-sm font-medium tracking-[-0.01em] transition-colors ${
                    isActive
                      ? "bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)]"
                      : "text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]"
                  }`}
                >
                  {INTERVAL_LABEL[option]}
                  {option === "annual" && yearlySaving ? (
                    <span className="ml-1.5 text-[0.7rem] font-semibold opacity-80">{yearlySaving}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Two or three cards a side: one column on a phone, then one column
            per card from lg, so the two-card side has no empty slot. */}
        <div className={`grid gap-6 ${tiers.length === 2 ? "lg:mx-auto lg:w-full lg:max-w-[52rem] lg:grid-cols-2" : "lg:grid-cols-3"}`}>
          {tiers.map((tierId) => {
            const tier = getTier(tierId);
            const { figure, unit, sub } = cardPrice(tierId, interval, currency);
            const features = tierFeatures(tierId, currency, interval);
            const badge = BADGE[tierId];
            return (
              <div
                key={tierId}
                className={`flex h-full flex-col rounded-[1.5rem] border bg-[var(--marketing-surface-muted)] p-6 ${
                  badge ? "border-[var(--marketing-accent)]" : "border-[var(--marketing-border)]"
                }`}
              >
                <p className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                  {tier.label}
                  {badge ? (
                    <span className="rounded-full bg-[var(--marketing-accent)]/10 px-2 py-0.5 text-[0.62rem] tracking-[0.08em]">
                      {badge}
                    </span>
                  ) : null}
                </p>

                <p className="mt-3 text-sm leading-6 text-[var(--marketing-text-muted)] md:min-h-12">{tier.audience}</p>

                <p className="mt-3 flex flex-wrap items-baseline gap-x-1">
                  <span className="text-3xl font-black tracking-tighter text-[var(--marketing-text)]">{figure}</span>
                  {unit ? <span className="text-sm text-[var(--marketing-text-muted)]">{unit}</span> : null}
                </p>
                <p className="mt-2 text-[0.8rem] leading-5 text-[var(--marketing-text-muted)] md:min-h-10">{sub}</p>

                {isSelfServePurchase(tierId, interval) ? (
                  <a
                    href={`${APP_ORIGIN}/checkout?plan=${tierId}&period=${interval}`}
                    data-track="pricing_plan_clicked"
                    data-plan={tierId}
                    data-period={interval}
                    className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--marketing-primary)] px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] transition-colors hover:bg-[var(--marketing-primary-hover)]"
                  >
                    {`Choose ${tier.label}`}
                  </a>
                ) : (
                  <a
                    href={salesMailto(tier.label)}
                    data-track="pricing_contact_clicked"
                    data-plan={tierId}
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--marketing-border)] px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text)] transition-colors hover:bg-[var(--marketing-surface)]"
                  >
                    Talk to us
                  </a>
                )}

                {/* What the plan includes: each card adds to the one before it.
                    Every line is true of the product today. */}
                <p className="mt-6 border-b border-[var(--marketing-border)] pb-2.5 text-[0.8rem] text-[var(--marketing-text-subtle)]">
                  {features.heading}
                </p>
                <ul className="mt-3 flex flex-1 flex-col gap-2.5">
                  {features.lines.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 text-sm leading-6 text-[var(--marketing-text-muted)]"
                    >
                      <RiCheckLine className="mt-1 size-4 shrink-0 text-[var(--marketing-accent)]" aria-hidden="true" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-6 text-[var(--marketing-text-muted)]">
          {currency === "USD"
            ? `Need more? Add AI credits (${money(CREDIT_PACK_USD.priceUsd, "USD")} for ${CREDIT_PACK_USD.credits}) on any plan.`
            : `Need more? Add AI credits (from ${money(Math.min(...Object.values(CREDIT_OVERAGE_NAIRA)), "NGN")} each, up to a limit you set) on any plan${
                canBuyAddon("manager", "person")
                  ? `, or a person (${money(ADDON_PRICES_NAIRA.person, "NGN")}/month) or an artist (${money(ADDON_PRICES_NAIRA.artist, "NGN")}/month) on Pro and Pro Plus`
                  : ""
              }.`}
        </p>
        <p className="mt-3 text-center text-xs leading-6 text-[var(--marketing-text-subtle)]">
          {currency === "USD"
            ? "Prices are in US dollars. One price covers your whole team, not each person. Pay monthly or once a year, by card or with USDT or USDC. In Nigeria? You pay in Naira."
            : "Prices are in Naira. One price covers your whole team, not each person. Pay monthly or once a year, by card or bank transfer."}
        </p>

        <PricingCompareTable group={group} currency={currency} />
      </div>
    </section>
  );
}
