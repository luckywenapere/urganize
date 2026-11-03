"use client";

import { useState } from "react";
import { RiCheckLine, RiWhatsappLine } from "react-icons/ri";
import {
  DEFAULT_SELLING_INTERVAL,
  INTRO_MONTHS,
  PRICING_TIER_ORDER,
  SALES_WHATSAPP_URL,
  SELLABLE_INTERVALS,
  getIntroPrice,
  getTier,
  getTierPrice,
  introThenLine,
  isSelfServePurchase,
  tierFeatures,
  type BillingInterval,
  type PricingTierId,
} from "@urganize/pricing";
import { APP_ORIGIN } from "@/lib/app-urls";
import { PlanPicture } from "@urganize/ui/PlanPicture";

// The price table.
//
// EVERY NUMBER ON THIS PAGE COMES OUT OF @urganize/pricing, and none of it is
// written here. The prices come from the tier definitions and the ceilings come
// from `tierHighlights`, which builds its lines from the same `limits` field
// apps/web enforces against. So this page cannot advertise a seat count, a
// release count or an UrgAns allowance that the product does not actually
// apply (the distribution line too: DISTRIBUTION_ALLOWANCE, enforced by
// apps/web/lib/distribution-limits.ts). Note this site only rebuilds when
// apps/homepage changes, so a change in packages/pricing alone needs a nudge
// here to reach urganize.app — which is the failure this repo has shipped repeatedly with prices
// (four separate occasions of a page quoting one figure while checkout charged
// another, all recorded in CLAUDE.md).
//
// THE TWO PRICED TIERS SELL THEMSELVES; THE SALES-LED ONE STARTS A CONVERSATION
// (founder call, 2026-08-30; Label is that card again since 2026-10-26, with no
// price shown, and its button opens WhatsApp). This narrows the 2026-08-24 rule that every CTA
// on this page was a capture, and it splits on who can be served without us in
// the room: a manager on Solo or Manager can sign up, get the free team trial
// and run a release alone, while a roster deal is still scoped and set up by
// hand. So Solo and Manager send people to the trial and Label says "Let's
// talk". (Group said the same until it came off the page the same day.)
//
// The trial CTA points at APP_SIGNUP_URL, which is /onboarding rather than
// /auth: apps/web's /auth is LOGIN-ONLY and has no signup form, so pointing a
// "start" CTA there lands people on a page with no way to create an account.
// The constant is the single definition of that, shared with the header and the
// /signup page.
//
// The WhatsApp message names the tier the visitor was looking at, so the
// founder knows which plan someone came in on.

/** Tiers a visitor can start on their own. Everything else talks to us first.
 *
 *  DERIVED, NOT LISTED, since 2026-09-08. It was a hand-written Set of two ids,
 *  and it went stale the same day Label got a price: the card would have shown
 *  ₦50,000 above a "Let's talk" button. A tier is self-serve exactly when it is
 *  not `contactSales`, which is the same fact `isSelfServeTier` encodes on the
 *  checkout side and the same derivation the in-app wall already makes. */
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

/** The big figure, its unit, and the line under it, for one card.
 *
 *  MONTHLY SHOWS THE STARTING PRICE (founder, 2026-10-26): what a team paying
 *  for the first time pays for its first INTRO_MONTHS months, with the full
 *  price it moves to right under it. No badge and no percentage: the lower
 *  price is simply the price. */
function cardPrice(
  tierId: PricingTierId,
  interval: BillingInterval
): { figure: string; unit: string | null; sub: string | null; was: string | null } {
  if (!isSelfServe(tierId)) {
    return { figure: "Let's talk", unit: null, sub: "A price set with you, for your roster.", was: null };
  }
  if (interval === "monthly") {
    const intro = getIntroPrice(tierId);
    const full = getTierPrice(tierId, "monthly");
    // The full price struck through above the offer (founder, Nov 2, 2026).
    if (intro) return { figure: naira(intro.amount), unit: "/month", sub: introThenLine(tierId), was: full ? `${naira(full.amount)}/month` : null };
    return { figure: full ? naira(full.amount) : "", unit: "/month", sub: null, was: null };
  }
  const yearly = getTierPrice(tierId, interval);
  if (!yearly) return { figure: "", unit: null, sub: null, was: null };
  return {
    figure: naira(yearly.amount),
    unit: "/year",
    sub: `${naira(Math.round(yearly.amount / 12))} a month, paid once a year`,
    was: null,
  };
}

/** WhatsApp, with the plan named, for the contact-us card. */
function contactUrl(tierLabel: string): string {
  return `${SALES_WHATSAPP_URL}?text=${encodeURIComponent(`Hi, I'd like to talk about the ${tierLabel} plan.`)}`;
}

export function PricingTierCards() {
  const [interval, setInterval] = useState<BillingInterval>(DEFAULT_SELLING_INTERVAL);

  return (
    <section className="relative px-6 pb-20">
      <div className="mx-auto max-w-5xl">
        {/* Above the cards, because it reprices every one of them. Monthly and
            yearly only since 2026-10-26: the 6-month prepay is gone and the
            starting price on monthly takes its place. */}
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
                </button>
              );
            })}
          </div>
        </div>
        {/* Three cards: Solo and Manager are bought here, Label is contact-us
            (2026-10-26). Group came off the page the same day. One column on a
            phone, three from md. */}
        <div className="grid gap-6 md:grid-cols-3">
          {PRICING_TIER_ORDER.map((tierId) => {
            const tier = getTier(tierId);
            const priced = isSelfServe(tierId);
            const { figure, unit, sub, was } = cardPrice(tierId, interval);
            const features = tierFeatures(tierId);
            // Outcomes first (#1053, the 3 Nov positioning), then the limits.
            // A limit already said as an outcome is not said twice.
            const outcomes = tier.outcomes ?? [];
            const featureLines = features.lines.filter((line) => !outcomes.includes(line));
            return (
              <div
                key={tierId}
                className="flex h-full flex-col rounded-[1.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6"
              >
                {/* What the plan looks like in the app, before the words (#963). */}
                <PlanPicture
                  activeReleases={tier.limits.activeReleases}
                  seats={tier.limits.seats}
                  monthlyCredits={tier.urgansMonthlyCredits}
                />

                <p className="mt-5 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                  {tier.label}
                  {was ? (
                    <span className="rounded-full bg-[var(--marketing-accent)]/10 px-2 py-0.5 text-[0.62rem] tracking-[0.08em]">
                      First month offer
                    </span>
                  ) : null}
                </p>

                {/* Keeps its line on every card so the prices line up. */}
                <p className="mt-4 min-h-5 text-sm text-[var(--marketing-text-muted)] line-through">{was ?? ""}</p>
                <p className="flex flex-wrap items-baseline gap-x-1">
                  <span className="text-3xl font-black tracking-tighter text-[var(--marketing-text)]">{figure}</span>
                  {unit ? <span className="text-sm text-[var(--marketing-text-muted)]">{unit}</span> : null}
                </p>
                <p className="mt-2 text-[0.8rem] leading-5 text-[var(--marketing-text-muted)] md:min-h-10">{sub}</p>

                <p className="mt-3 text-sm leading-6 text-[var(--marketing-text-muted)] md:min-h-12">{tier.audience}</p>

                {/* The ask before the reasons (2026-09-11). Solo and Manager go
                    straight to checkout for that plan and period; Label opens a
                    WhatsApp chat. */}
                {priced && isSelfServePurchase(tierId, interval) ? (
                  <a
                    href={`${APP_ORIGIN}/checkout?plan=${tierId}&period=${interval}`}
                    data-track="pricing_plan_clicked"
                    data-plan={tierId}
                    data-period={interval}
                    className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--marketing-primary)] px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] transition-colors hover:bg-[var(--marketing-primary-hover)]"
                  >
                    {`Get ${tier.label}`}
                  </a>
                ) : (
                  <a
                    href={contactUrl(tier.label)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-track="pricing_contact_clicked"
                    data-plan={tierId}
                    className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--marketing-primary)] px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] transition-colors hover:bg-[var(--marketing-primary-hover)]"
                  >
                    <RiWhatsappLine className="size-4" aria-hidden="true" />
                    Contact us
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

                {/* What the plan includes, X-style: each card adds to the one
                    before it. Every line is true of the product today. */}
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

        <p className="mt-8 text-center text-xs leading-6 text-[var(--marketing-text-subtle)]">
          Prices are in Naira. One price covers your whole team, not each person. The first{" "}
          {INTRO_MONTHS === 1 ? "month" : `${INTRO_MONTHS} months`} offer is for teams paying for the first time. Pay monthly or once a year,
          by card or bank transfer.
        </p>
      </div>
    </section>
  );
}
