"use client";

import { useState } from "react";
import { RiCheckLine } from "react-icons/ri";
import {
  PRICING_TIER_ORDER,
  SALES_CONTACT_EMAIL,
  annualSavingCopy,
  formatTierCyclePrice,
  getTier,
  tierHighlights,
  type BillingInterval,
  type PricingTierId,
} from "@urganize/pricing";
import { APP_SIGNUP_URL } from "@/lib/app-urls";

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
// THE TWO LOWEST TIERS SELL THEMSELVES; THE TWO HIGHEST START A CONVERSATION
// (founder call, 2026-08-30). This narrows the 2026-08-24 rule that every CTA
// on this page was a capture, and it splits on who can be served without us in
// the room: a manager on Solo or Manager can sign up, get the free team trial
// and run a release alone, while a roster deal is still scoped and set up by
// hand. So Solo and Manager send people to the trial, Label keeps "Book a demo"
// and Group keeps "Let's talk".
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

const INTERVALS: readonly BillingInterval[] = ["monthly", "annual"] as const;

/** Tiers a visitor can start on their own. Everything else talks to us first. */
const SELF_SERVE_TIERS: ReadonlySet<PricingTierId> = new Set<PricingTierId>([
  "solo",
  "manager",
]);

const INTERVAL_LABEL: Record<BillingInterval, string> = {
  monthly: "Monthly",
  annual: "Annual",
};

function mailtoFor(tierLabel: string): string {
  const subject = `Urganize ${tierLabel} plan`;
  return `mailto:${SALES_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export function PricingTierCards() {
  // Annual first. It is the better deal and the one most teams take, so opening
  // on monthly would show everybody the higher-looking number first.
  const [interval, setInterval] = useState<BillingInterval>("annual");

  const saving = annualSavingCopy("label");

  return (
    <section className="relative px-6 pb-20">
      {/* max-w-6xl, up from 5xl, because there are four cards now: at 5xl the
          four-across row left each card too narrow for "₦800,000/yr" to sit on
          one line. */}
      <div className="mx-auto max-w-6xl">
        {/* Interval switch. Above the cards, because it reprices every one of
            them and asking for it afterwards would move the numbers under the
            reader's cursor. */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div
            role="radiogroup"
            aria-label="Choose how often you pay"
            className="inline-flex overflow-hidden rounded-full border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-1"
          >
            {INTERVALS.map((option) => {
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
          {/* Phrased as months, never as a percentage — the one wording the
              pricing package requires. Derived from ANNUAL_MONTHS_BILLED. */}
          {saving && interval === "annual" ? (
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--marketing-accent)]">
              {saving}
            </p>
          ) : null}
        </div>

        {/* Four cards, three steps: one column on a phone (which is where most
            of this traffic reads it), two from sm, four only at xl. Deliberately
            NOT four from md — at 768px that is ~170px a card, which wraps the
            price and every ceiling line. Two comfortable columns beat four
            cramped ones. */}
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {PRICING_TIER_ORDER.map((tierId) => {
            const tier = getTier(tierId);
            const price = formatTierCyclePrice(tierId, interval);
            const highlights = tierHighlights(tierId);
            const selfServe = SELF_SERVE_TIERS.has(tierId);
            return (
              <div
                key={tierId}
                className={`flex h-full flex-col rounded-[1.5rem] border p-6 ${
                  tier.recommended
                    ? "border-[var(--marketing-accent)]/50 bg-[var(--marketing-accent)]/[0.06]"
                    : "border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                    {tier.label}
                  </p>
                  {tier.recommended ? (
                    <span className="rounded-full bg-[var(--marketing-accent)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--marketing-accent)]">
                      Most teams
                    </span>
                  ) : null}
                </div>

                {/* A sales-led tier has no `prices` at all, so there is no
                    figure to render and no risk of printing one we never
                    quoted. */}
                <p className="mt-4 text-3xl font-black tracking-tighter text-[var(--marketing-text)]">
                  {price ?? "Let's talk"}
                </p>

                <p className="mt-3 text-sm leading-6 text-[var(--marketing-text-muted)]">
                  {tier.audience}
                </p>

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

                <a
                  href={selfServe ? APP_SIGNUP_URL : mailtoFor(tier.label)}
                  className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium tracking-[-0.02em] transition-colors ${
                    tier.recommended
                      ? "bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)]"
                      : "border border-[var(--marketing-border)] text-[var(--marketing-text)] hover:border-[var(--marketing-accent)]/50"
                  }`}
                >
                  {selfServe
                    ? "Start free trial"
                    : tier.contactSales
                      ? "Let's talk"
                      : "Book a demo"}
                </a>
              </div>
            );
          })}
        </div>

        {/* The trial terms belong beside the button that starts one. 14 days and
            no card are the shipped terms (TEAM_TRIAL_DAYS in apps/web, and the
            /signup page says the same) — if either changes, all three move
            together. */}
        <p className="mt-8 text-center text-xs leading-6 text-[var(--marketing-text-subtle)]">
          Prices are in Naira and cover your whole team, not each person. Annual
          plans are billed once a year. The trial runs 14 days for your whole
          team and needs no card.
        </p>
      </div>
    </section>
  );
}
