"use client";

import { useState } from "react";
import { RiCheckLine } from "react-icons/ri";
import {
  CREDIT_PACK,
  DEFAULT_SELLING_INTERVAL,
  EXTRA_RELEASE_PRICE_NAIRA,
  PRICING_TIER_ORDER,
  SELLABLE_INTERVALS,
  annualSavingCopy,
  formatTierFromPrice,
  getTier,
  getTierPrice,
  isSelfServePurchase,
  tierFeatures,
  type BillingInterval,
  type PricingTierId,
} from "@urganize/pricing";
import { APP_ORIGIN } from "@/lib/app-urls";
import { salesMailto } from "@/lib/sales-mailto";
import { PlanPicture } from "@urganize/ui/PlanPicture";
import { PricingCompareTable } from "./PricingCompareTable";

// The price table.
//
// EVERY NUMBER ON THIS PAGE COMES OUT OF @urganize/pricing, and none of it is
// written here. The prices come from the tier definitions and the ceilings come
// from `tierFeatures` / `tierHighlights`, which build their lines from the same
// `limits` field apps/web enforces against. So this page cannot advertise a
// seat count, a rollout count or a credit allowance the product does not
// actually apply. Note this site only rebuilds when apps/homepage changes, so a
// change in packages/pricing alone needs a nudge here to reach urganize.app.
//
// PRICING V3 (founder, 2026-11-07, #1112): four cards. Solo, Manager and Pro
// are bought here by card, monthly by default or yearly with two months free.
// Label is a custom deal: it shows its starting price ("From ₦100,000/month")
// and its button opens an email to us, never a checkout. There is no
// first-month price on any plan any more.
//
// `tier.recommended` puts a "Most popular" badge on Manager. It was ignored on
// this page from 2026-09-11 (every card identical); the founder brought the
// badge back with this ladder.

/** Tiers a visitor can start on their own. Everything else talks to us first.
 *  Derived from `contactSales`, the same fact checkout reads. */
function isSelfServe(tierId: PricingTierId): boolean {
  return !getTier(tierId).contactSales;
}

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: "Monthly",
  semiannual: "6 months",
  annual: "Yearly",
};

const naira = (amount: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(amount);

/** The big figure, its unit, and the line under it, for one card. */
function cardPrice(
  tierId: PricingTierId,
  interval: BillingInterval
): { figure: string; unit: string | null; sub: string | null } {
  if (!isSelfServe(tierId)) {
    // "From ₦100,000/month": a floor, agreed per deal.
    const from = formatTierFromPrice(tierId, interval);
    if (!from) return { figure: "Let's talk", unit: null, sub: "A price set with you, for your roster." };
    const [figure, unit] = from.split("/");
    return { figure, unit: unit ? `/${unit}` : null, sub: "A price set with you, for your roster." };
  }
  if (interval === "monthly") {
    const monthly = getTierPrice(tierId, "monthly");
    return { figure: monthly ? naira(monthly.amount) : "", unit: "/month", sub: null };
  }
  const yearly = getTierPrice(tierId, interval);
  if (!yearly) return { figure: "", unit: null, sub: null };
  return {
    figure: naira(yearly.amount),
    unit: "/year",
    sub: `${naira(Math.round(yearly.amount / 12))} a month, paid once a year`,
  };
}

export function PricingTierCards() {
  const [interval, setInterval] = useState<BillingInterval>(DEFAULT_SELLING_INTERVAL);
  // "2 months free", from the same constant that computes the yearly price.
  const yearlySaving = annualSavingCopy("solo");

  return (
    <section className="relative px-6 pb-20">
      <div className="mx-auto max-w-6xl">
        {/* Above the cards, because it reprices every one of them. */}
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

        {/* One column on a phone, two from md, four from xl. */}
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PRICING_TIER_ORDER.map((tierId) => {
            const tier = getTier(tierId);
            const priced = isSelfServe(tierId);
            const { figure, unit, sub } = cardPrice(tierId, interval);
            const features = tierFeatures(tierId);
            // Outcomes first, then the limits. A limit already said as an
            // outcome is not said twice.
            const outcomes = tier.outcomes ?? [];
            const featureLines = features.lines.filter((line) => !outcomes.includes(line));
            const recommended = Boolean(tier.recommended);
            return (
              <div
                key={tierId}
                className={`flex h-full flex-col rounded-[1.5rem] border bg-[var(--marketing-surface-muted)] p-6 ${
                  recommended ? "border-[var(--marketing-accent)]" : "border-[var(--marketing-border)]"
                }`}
              >
                {/* What the plan looks like in the app, before the words. */}
                <PlanPicture
                  activeReleases={tier.limits.activeReleases}
                  seats={tier.limits.seats}
                  monthlyCredits={tier.urgansMonthlyCredits}
                />

                <p className="mt-5 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                  {tier.label}
                  {recommended ? (
                    <span className="rounded-full bg-[var(--marketing-accent)]/10 px-2 py-0.5 text-[0.62rem] tracking-[0.08em]">
                      Most popular
                    </span>
                  ) : null}
                </p>

                <p className="mt-4 flex flex-wrap items-baseline gap-x-1">
                  <span className="text-3xl font-black tracking-tighter text-[var(--marketing-text)]">{figure}</span>
                  {unit ? <span className="text-sm text-[var(--marketing-text-muted)]">{unit}</span> : null}
                </p>
                <p className="mt-2 text-[0.8rem] leading-5 text-[var(--marketing-text-muted)] md:min-h-10">{sub}</p>

                <p className="mt-3 text-sm leading-6 text-[var(--marketing-text-muted)] md:min-h-12">{tier.audience}</p>

                {/* Solo, Manager and Pro go straight to checkout for that plan
                    and period; Label opens an email to us. */}
                {priced && isSelfServePurchase(tierId, interval) ? (
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

                {tier.outcomeHeading ? (
                  <>
                    <p className="mt-6 text-sm font-semibold text-[var(--marketing-text)]">{tier.outcomeHeading}</p>
                    <ul className="mt-3 flex flex-col gap-2.5">
                      {outcomes.map((line) => (
                        <li
                          key={line}
                          className="flex items-start gap-2 text-sm leading-6 text-[var(--marketing-text-muted)]"
                        >
                          <RiCheckLine className="mt-1 size-4 shrink-0 text-[var(--marketing-accent)]" aria-hidden="true" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {/* What the plan includes: each card adds to the one before it.
                    Every line is true of the product today. */}
                <p className="mt-6 border-b border-[var(--marketing-border)] pb-2.5 text-[0.8rem] text-[var(--marketing-text-subtle)]">
                  {features.heading}
                </p>
                <ul className="mt-3 flex flex-1 flex-col gap-2.5">
                  {featureLines.map((line) => (
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
          Each single you send to stores counts as one release. EPs and albums are coming. People you share a brief with, playlist curators and DJs
          are free and never take a place on your team.
        </p>
        <p className="mt-3 text-center text-xs leading-6 text-[var(--marketing-text-subtle)]">
          Prices are in Naira. One price covers your whole team, not each person. Pay monthly or once a year, by card
          or bank transfer.
        </p>

        <PricingCompareTable interval={interval} />

        {/* Add-ons: only what can be bought today. */}
        <div className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-center text-2xl md:text-3xl">Add-ons</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            <li className="rounded-[1.25rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-5">
              <p className="text-sm font-semibold text-[var(--marketing-text)]">More AI credits</p>
              <p className="mt-1 text-2xl font-black tracking-tighter text-[var(--marketing-text)]">
                {naira(CREDIT_PACK.priceNaira)}
              </p>
              <p className="mt-1 text-sm text-[var(--marketing-text-muted)]">
                {`For ${CREDIT_PACK.credits} credits, on any plan.`}
              </p>
            </li>
            <li className="rounded-[1.25rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-5">
              <p className="text-sm font-semibold text-[var(--marketing-text)]">Send a single to stores</p>
              <p className="mt-1 text-2xl font-black tracking-tighter text-[var(--marketing-text)]">
                {naira(EXTRA_RELEASE_PRICE_NAIRA)}
              </p>
              <p className="mt-1 text-sm text-[var(--marketing-text-muted)]">
                Each, on Solo and Manager, or past what Pro and Label include.
              </p>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
