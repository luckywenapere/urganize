"use client";

import { useState } from "react";
import { RiCheckLine } from "react-icons/ri";
import {
  DEFAULT_SELLING_INTERVAL,
  PRICING_TIER_ORDER,
  SELLABLE_INTERVALS,
  annualSavingCopy,
  formatTierPrice,
  getTier,
  isSelfServePurchase,
  tierHighlights,
  type BillingInterval,
  type PricingTierId,
} from "@urganize/pricing";
import { APP_ORIGIN } from "@/lib/app-urls";
import { salesMailto } from "@/lib/sales-mailto";

// The price table.
//
// EVERY NUMBER ON THIS PAGE COMES OUT OF @urganize/pricing, and none of it is
// written here. The prices come from the tier definitions and the ceilings come
// from `tierHighlights`, which builds its lines from the same `limits` field
// apps/web enforces against. So this page cannot advertise a seat count, a
// release count or an UrgAns allowance that the product does not actually
// apply — which is the failure this repo has shipped repeatedly with prices
// (four separate occasions of a page quoting one figure while checkout charged
// another, all recorded in CLAUDE.md).
//
// THE TWO PRICED TIERS SELL THEMSELVES; THE SALES-LED ONE STARTS A CONVERSATION
// (founder call, 2026-08-30). This narrows the 2026-08-24 rule that every CTA
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
// The mailto subject names the tier the visitor was looking at. That is not
// decoration: it is the only signal the founder gets about which plan someone
// came in on, and it costs nothing to carry.

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

// THE BILLING LINE IS DERIVED FROM WHAT IS ON SALE, not typed (2026-10-09).
// It said "Every plan is paid once a year." while the switch above the cards
// offered Monthly and Yearly: true on 2026-09-08, when yearly was the only
// interval, and nobody changed it when monthly came back two days later. It is
// the same drift this file's header describes for prices, so it reads the same
// list the switch does. The both-intervals wording is the one /terms uses.
function billingLine(intervals: readonly BillingInterval[]): string {
  const monthly = intervals.includes("monthly");
  const annual = intervals.includes("annual");
  if (monthly && intervals.includes("semiannual") && annual) {
    return "Pay monthly, every 6 months or once a year, by card or bank transfer.";
  }
  if (monthly && annual) return "You can pay monthly or once a year.";
  if (annual) return "Every plan is paid once a year.";
  return "Every plan is paid monthly.";
}

export function PricingTierCards() {
  // Monthly first: it is the price we set and the smaller number, so opening on
  // yearly would show every visitor the larger figure first. The saving badge
  // beside the toggle is what argues for the yearly option.
  const [interval, setInterval] = useState<BillingInterval>(DEFAULT_SELLING_INTERVAL);

  // Read off the first tier that still HAS a price rather than a named one: a
  // named tier that later goes sales-led returns null and silently takes the
  // badge off the page, which has happened here once already.
  const saving = PRICING_TIER_ORDER.map(annualSavingCopy).find(Boolean) ?? null;

  return (
    <section className="relative px-6 pb-20">
      {/* max-w-6xl for four cards (Group came back 2026-10-02; it was max-w-5xl
          for the three between 2026-09-09 and then). THE INTERVAL SWITCH
          CAME BACK on 2026-09-10, when monthly went on sale again beside
          yearly; it and the "2 months free" badge were absent from 2026-09-08,
          while there was only one interval to show. */}
      <div className="mx-auto max-w-6xl">
        {/* Above the cards, because it reprices every one of them and asking
            for it afterwards would move the numbers under the reader's
            cursor. */}
        <div className="mb-10 flex flex-col items-center gap-3">
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
          {/* Phrased as months, never a percentage — the one wording the pricing
              package allows. Derived from ANNUAL_MONTHS_BILLED. */}
          {saving && interval === "annual" ? (
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--marketing-accent)]">
              {saving}
            </p>
          ) : null}
        </div>
        {/* Four cards since 2026-10-02 (Group, the "Let's talk" card, came
            back): one column on a phone, where most of this traffic reads it,
            two from sm and four from xl. Not four from md: at 768px that is
            about 170px a card, which wraps the price and every line. */}
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {PRICING_TIER_ORDER.map((tierId) => {
            const tier = getTier(tierId);
            const price = formatTierPrice(tierId, interval);
            const highlights = tierHighlights(tierId);
            const priced = isSelfServe(tierId);
            // Onboarding rules (2026-10-26): only monthly Solo and Manager are
            // paid for without a call. Label and every 6-month or yearly plan
            // lead to booking one; the payment link comes after it.
            const selfServe = priced && isSelfServePurchase(tierId, interval);
            const callLed = priced && !selfServe;
            return (
              <div
                key={tierId}
                className="flex h-full flex-col rounded-[1.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6"
              >
                {/* NO BADGE AND NO ELEVATION — all three cards are identical:
                    same border, same ground, same filled CTA below. Founder
                    call, 2026-09-11, in two passes the same day: the "Most
                    teams" badge went first, and then the accent border and
                    ground that had been left doing the emphasis on their own.

                    `tier.recommended` is NOT read on this surface any more, nor
                    on the homepage pricing strip. It is not dormant either —
                    the in-app wall's TierPlanPicker still renders its badge off
                    it, and that is deliberately a separate surface and a
                    separate call. So reaching for the flag to re-emphasise a
                    card here would reopen exactly what was just closed. */}
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                  {tier.label}
                </p>

                {/* A sales-led tier has no `prices` at all, so there is no
                    figure to render and no risk of printing one we never
                    quoted. */}
                <p className="mt-4 text-3xl font-black tracking-tighter text-[var(--marketing-text)]">
                  {price ?? "Let's talk"}
                </p>

                <p className="mt-3 text-sm leading-6 text-[var(--marketing-text-muted)]">
                  {tier.audience}
                </p>

                {/* CTA LEADS THE CHECKLIST (moved here 2026-09-11, founder
                    call): the ask comes before the reasons, not after them —
                    a visitor who already wants in should not have to scroll
                    past the list to find the button. FILLED ON EVERY CARD,
                    and that was a choice rather than a deletion: the two
                    branches this replaced differed in box model (the other
                    added its own `border`), so uniform meant picking one.
                    Filled, because TrialButton — the site's one primary ask,
                    twelve mounts — and the header pill both carry these exact
                    three classes, so this is the site's CTA look rather than
                    a per-tier emphasis. What it replaced was explicitly the
                    de-emphasised treatment (no fill, hover only on the
                    border), so demoting all three to that would have left
                    /pricing with no filled CTA at all — quieter than today,
                    which is more than uniform asks for. Deliberately NOT
                    also taking TrialButton's drop shadow; three shadowed
                    buttons in one card row is a different change. */}
                {/* Self-serve checkout (2026-10-22): a priced card goes straight
                    to checkout for that plan and period. Paying skips the
                    waitlist; the app's sign-up comes first when needed. */}
                <a
                  href={priced ? `${APP_ORIGIN}/checkout?plan=${tierId}&period=${interval}` : salesMailto(tier.label)}
                  data-track={priced ? "pricing_plan_clicked" : undefined}
                  data-plan={priced ? tierId : undefined}
                  data-period={priced ? interval : undefined}
                  className="mt-6 inline-flex items-center justify-center rounded-full bg-[var(--marketing-primary)] px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] transition-colors hover:bg-[var(--marketing-primary-hover)]"
                >
                  {/* Two outcomes, not three. "Book a demo" used to sit on a
                      priced tier that was not self-serve; since 2026-09-08 the
                      two conditions are exact complements, so that branch was
                      unreachable and is gone rather than left to rot. */}
                  {selfServe ? `Get ${tier.label}` : callLed ? "Book a call" : "Let's talk"}
                </a>

                <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                  {highlights.map((line) => (
                    <li
                      key={line}
                      className="flex items-start gap-2 text-sm leading-6 text-[var(--marketing-text-muted)]"
                    >
                      <RiCheckLine
                        className="mt-1 size-4 shrink-0 text-[var(--marketing-accent)]"
                        aria-hidden="true"
                      />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* The trial terms belong beside the button that starts one. 3 days and
            no card are the shipped terms (TEAM_TRIAL_DAYS in apps/web, and the
            /signup page says the same) — if either changes, all three move
            together. Shortened from 14 days by a founder call on 2026-09-10.
            "Your whole team" rather than "your workspace": that word is out
            of anything a customer reads. */}
        <p className="mt-8 text-center text-xs leading-6 text-[var(--marketing-text-subtle)]">
          Prices are in Naira. One price covers your whole team, not each person.{" "}
          {billingLine(SELLABLE_INTERVALS)}
        </p>
      </div>
    </section>
  );
}
