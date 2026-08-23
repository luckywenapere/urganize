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
} from "@urganize/pricing";

// The three-column price table.
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
// EVERY CTA IS A CAPTURE, NOT A CHECKOUT (founder call, 2026-08-24). The
// marketing site does not sell; it starts a conversation. So a priced card
// books a demo and the sales-led card emails us, and the waitlist section below
// this one stays exactly where it was. Nothing here links to app.urganize.app,
// which would reopen the self-serve funnel the founder closed deliberately.
//
// The mailto subject names the tier the visitor was looking at. That is not
// decoration: it is the only signal the founder gets about which plan someone
// came in on, and it costs nothing to carry.

const INTERVALS: readonly BillingInterval[] = ["monthly", "annual"] as const;

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
      <div className="mx-auto max-w-5xl">
        {/* Interval switch. Above the cards, because it reprices all three. */}
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

        <div className="grid gap-6 md:grid-cols-3">
          {PRICING_TIER_ORDER.map((tierId) => {
            const tier = getTier(tierId);
            const price = formatTierCyclePrice(tierId, interval);
            const highlights = tierHighlights(tierId);
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
                  href={mailtoFor(tier.label)}
                  className={`mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium tracking-[-0.02em] transition-colors ${
                    tier.recommended
                      ? "bg-[var(--marketing-primary)] text-[var(--marketing-primary-text)] hover:bg-[var(--marketing-primary-hover)]"
                      : "border border-[var(--marketing-border)] text-[var(--marketing-text)] hover:border-[var(--marketing-accent)]/50"
                  }`}
                >
                  {tier.contactSales ? "Let's talk" : "Book a demo"}
                </a>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs leading-6 text-[var(--marketing-text-subtle)]">
          Prices are in Naira and cover your whole team, not each person. Annual
          plans are billed once a year.
        </p>
      </div>
    </section>
  );
}
