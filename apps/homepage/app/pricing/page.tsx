"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { RiCheckLine } from "react-icons/ri";
import {
  CONTACT_SALES_EMAIL,
  CONTACT_SALES_SUBJECT,
  DEFAULT_PRICING_CURRENCY,
  SUPPORTED_CURRENCIES,
  formatPlanCyclePrice,
  formatPlanPrice,
  getPlanPrice,
  type PricingCurrencyCode,
} from "@urganize/pricing";

// PRICING DATA SOURCE
//
// Numbers, currency rules, and plan IDs all come from @urganize/pricing —
// the same module the in-app /locked subscribe screen reads. There are no
// hardcoded amounts in this file. If billing changes, edit the shared
// package and both surfaces move together.
//
// Plan COPY (features list, tier summary) lives in this file because it's
// marketing-side framing, not a billing concern. Editing the copy here
// does not change what a customer is charged.

// In-app subscribe entry. Hitting this URL signed-out drops the user into
// the auth flow with `next=/locked`; signed-in users land directly on the
// plan picker. Use the canonical /locked path — that's the surface the app
// already exposes.
const APP_SUBSCRIBE_URL = "https://app.urganize.app/locked";

const CONTACT_HREF = `mailto:${CONTACT_SALES_EMAIL}?subject=${encodeURIComponent(CONTACT_SALES_SUBJECT)}`;

// Per-tier marketing copy. Keep the rhythm short and declarative.
//
// "Templates" intentionally says "single-release" only. EP, album, and
// music-video templates are scoped for v2 — same honesty rule as the
// pricing itself, we don't advertise what isn't built.
//
// The 28-day trial line was removed from this list because it's plan-
// agnostic (the trial applies to both Monthly and Annual). It lives in
// the hero subhead instead, where it covers both paths at once.
const MONTHLY_FEATURES = [
  "Unlimited releases on one workspace",
  "Hand-crafted single-release rollout template",
  "Tasks with assignees, dependencies, due dates",
  "Per-release file storage for masters, artwork, contracts",
  "Event milestones — listening parties, video shoots, release day",
  "Invite your A&R, PR, distributor",
] as const;

// Annual deltas only — the card already shows "Everything in Monthly" so
// these are the real differentiators. Kept to claims we'll actually honor:
// priority support, single yearly invoice, locked pricing. The "best for
// teams committed to a release year" line is positioning, not a feature
// — included because annual is genuinely the wrong choice for someone
// testing the water (they should pick Monthly or the 28-day trial).
const ANNUAL_FEATURES = [
  "Everything in Monthly",
  "Priority email support",
  "Billed once — one invoice, no monthly admin",
  "Best for teams committed to a release year",
  "Lock in current pricing for a year",
] as const;

const CUSTOM_FEATURES = [
  "Multi-artist / roster setup",
  "Custom template tailoring",
  "Hands-on onboarding for your team",
  "Direct line to the founders",
] as const;

const MONTHLY_SUMMARY = "Billed every month. Easiest way to start.";
const ANNUAL_SUMMARY = "Billed once a year. About two months free vs monthly.";
const CUSTOM_SUMMARY =
  "Multiple artists, a label roster, or a workflow we don't have yet. We'll scope it together.";

function annualMonthlyEquivalent(currency: PricingCurrencyCode): string {
  // Marketing context only — we round to a familiar number rather than
  // showing the exact 1/12 division. Source of truth is the annual amount
  // in the shared package; this is a labeled approximation.
  const annual = getPlanPrice("annual", currency).amount;
  const monthlyEquiv = annual / 12;
  if (currency === "NGN") {
    return `≈ ${formatPlanPrice({ currency, amount: Math.round(monthlyEquiv / 100) * 100, minorUnit: 0 })}/mo, billed annually`;
  }
  // USD: keep the cents for credibility on the small number.
  return `≈ $${monthlyEquiv.toFixed(2)}/mo, billed annually`;
}

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: {
    duration: 0.6,
    ease: [0.22, 1, 0.36, 1] as const,
  },
};

export default function PricingPage() {
  const [currency, setCurrency] = useState<PricingCurrencyCode>(DEFAULT_PRICING_CURRENCY);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--marketing-bg)] font-sans text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)]">
      {/* Floating pill nav — same pattern as /features so the two content
          pages feel like siblings. CTAs hit the real app, not the
          waitlist modal (this page is for visitors ready to subscribe
          today, not waitlist signups). */}
      <nav className="fixed left-1/2 top-6 z-[100] w-[90%] max-w-5xl -translate-x-1/2">
        <div className="flex items-center justify-between rounded-full border border-[var(--marketing-border)] bg-[var(--marketing-surface)]/90 px-6 py-3 shadow-[0_8px_32px_var(--marketing-shadow)] backdrop-blur-xl">
          <Link
            href="/"
            className="text-sm font-medium text-[var(--marketing-text-muted)] transition-colors hover:text-[var(--marketing-text)]"
          >
            ← Back to Home
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="https://app.urganize.app/auth"
              className="rounded-full border border-[var(--marketing-border-strong)] px-5 py-2 text-xs font-bold uppercase tracking-widest text-[var(--marketing-text)] transition-all hover:scale-105 hover:bg-[var(--marketing-surface-muted)]"
            >
              Login
            </Link>
            <Link
              href={APP_SUBSCRIBE_URL}
              className="rounded-full bg-[var(--marketing-primary)] px-5 py-2 text-xs font-bold uppercase tracking-widest text-[var(--marketing-primary-text)] shadow-[0_8px_24px_var(--marketing-shadow-strong)] transition-all hover:scale-105 hover:bg-[var(--marketing-primary-hover)]"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* HERO */}
        <section className="relative px-6 pb-12 pt-32 sm:pt-40">
          <div className="mx-auto max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--marketing-accent)]/30 bg-[var(--marketing-accent)]/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-accent)]"
            >
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--marketing-accent)]" />
              Pricing
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8 text-5xl font-black leading-[0.95] tracking-tighter sm:text-6xl md:text-7xl"
            >
              Built for the release.
              <br />
              <span className="text-[var(--marketing-accent)]">Priced per workspace.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mx-auto max-w-xl text-lg leading-relaxed text-[var(--marketing-text-muted)] md:text-xl"
            >
              One workspace, every release your team runs. Start with 28 days free, no card
              required.
            </motion.p>

            {/* Currency toggle. Default = NGN (primary market). Sticky in
                local state for this session; no persistence — the in-app
                /locked screen has its own toggle with the same options. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="mt-10 inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-[var(--marketing-text-subtle)]"
            >
              <span>Currency</span>
              <div
                role="radiogroup"
                aria-label="Display currency"
                className="inline-flex overflow-hidden rounded-full border border-[var(--marketing-border-strong)] bg-[var(--marketing-surface)]"
              >
                {SUPPORTED_CURRENCIES.map((code) => {
                  const isActive = currency === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      onClick={() => setCurrency(code)}
                      className={
                        isActive
                          ? "bg-[var(--marketing-accent)] px-4 py-1.5 text-[var(--marketing-primary-text)]"
                          : "px-4 py-1.5 text-[var(--marketing-text-muted)] hover:text-[var(--marketing-text)]"
                      }
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </section>

        {/* PRICING CARDS */}
        <section className="relative px-6 pb-20">
          <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
            <PricingTierCard
              name="Monthly"
              price={formatPlanCyclePrice("monthly", currency)}
              summary={MONTHLY_SUMMARY}
              features={MONTHLY_FEATURES}
              cta={{ label: "Start monthly", href: APP_SUBSCRIBE_URL }}
            />
            <PricingTierCard
              name="Annual"
              price={formatPlanCyclePrice("annual", currency)}
              priceSubline={annualMonthlyEquivalent(currency)}
              summary={ANNUAL_SUMMARY}
              features={ANNUAL_FEATURES}
              cta={{ label: "Start annual", href: APP_SUBSCRIBE_URL }}
              highlight
              badge="Best value"
            />
            <PricingTierCard
              name="Custom"
              price="Let's talk"
              summary={CUSTOM_SUMMARY}
              features={CUSTOM_FEATURES}
              cta={{ label: "Contact sales", href: CONTACT_HREF }}
            />
          </div>

          {/* Caption under the card row. Matches the card-row width
              (max-w-6xl on the parent) so it reads as a caption, not a
              floating paragraph. Paystack mention removed — the billing
              FAQ below covers it once, that's enough. */}
          <motion.p
            {...fadeInUp}
            className="mt-10 text-center text-sm text-[var(--marketing-text-subtle)]"
          >
            All prices in {currency} unless toggled. Cancel anytime from Settings.
          </motion.p>
        </section>

        {/* FAQ — kept tight. Pricing pages live or die on whether the
            obvious questions get clean answers. */}
        <section className="relative px-6 pb-28">
          <div className="mx-auto max-w-3xl space-y-4">
            <motion.h2
              {...fadeInUp}
              className="text-center text-3xl font-black tracking-tight md:text-4xl"
            >
              Questions we get
            </motion.h2>

            <div className="mt-8 space-y-4">
              <FaqRow
                question="Can I try Urganize first?"
                answer="Yes. The 28-day free trial doesn't ask for a card. Start it from the app — once it ends, pick a plan or stop using it."
              />
              <FaqRow
                question="What's actually different between monthly and annual?"
                answer="The same workspace, same features. Annual is one invoice instead of twelve, and works out cheaper. That's the whole difference."
              />
              <FaqRow
                question="Do I pay per teammate?"
                answer="No. One workspace, one price. Invite your A&R, PR, and distributor at no extra cost."
              />
              <FaqRow
                question="What does Custom mean?"
                answer="A label or agency running multiple artists, or a team that needs templates tailored to their workflow. We scope and price it with you."
              />
              <FaqRow
                question="How does billing work?"
                answer="Paystack processes the card. We charge in NGN or USD — your choice. You can cancel anytime from Settings and keep access through the period you paid for."
              />
            </div>
          </div>
        </section>
      </main>

      {/* Footer mirrors the homepage. Uses the same wordmark + small link
          row so navigating between marketing pages feels consistent. */}
      <footer
        className="pb-10 pt-14 sm:pb-12 sm:pt-16 lg:pb-14 lg:pt-20"
        style={{ borderTop: "0.5px solid var(--marketing-border)" }}
      >
        <div className="mx-auto max-w-[84rem] px-6 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
            <p className="font-display text-2xl font-semibold tracking-tight">Urganize</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm tracking-[-0.01em] text-[var(--marketing-text-subtle)]">
              <Link href="/" className="hover:text-[var(--marketing-text)]">
                Home
              </Link>
              <Link href="/features" className="hover:text-[var(--marketing-text)]">
                Features
              </Link>
              <Link href="/privacy" className="hover:text-[var(--marketing-text)]">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-[var(--marketing-text)]">
                Terms
              </Link>
              <a
                href="mailto:contact@urganize.app"
                className="hover:text-[var(--marketing-text)]"
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─── components ──────────────────────────────────────────────────────────────

type PricingTierCardProps = {
  name: string;
  price: string;
  priceSubline?: string;
  summary: string;
  features: readonly string[];
  cta: { label: string; href: string };
  highlight?: boolean;
  badge?: string;
};

function PricingTierCard({
  name,
  price,
  priceSubline,
  summary,
  features,
  cta,
  highlight = false,
  badge,
}: PricingTierCardProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={
        highlight
          ? "relative flex h-full flex-col rounded-[2rem] border border-[var(--marketing-accent)]/40 bg-[linear-gradient(180deg,rgba(110,233,155,0.10),rgba(255,255,255,0.04))] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.30)] backdrop-blur-xl"
          : "relative flex h-full flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_70px_rgba(0,0,0,0.22)] backdrop-blur-xl"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-text-muted)]">
          {name}
        </p>
        {badge ? (
          <span className="rounded-full border border-[var(--marketing-accent)]/40 bg-[var(--marketing-accent)]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--marketing-accent)]">
            {badge}
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        <p className="text-4xl font-black tracking-tight text-[var(--marketing-text)]">{price}</p>
        {priceSubline ? (
          <p className="mt-2 text-xs font-medium text-[var(--marketing-text-subtle)]">
            {priceSubline}
          </p>
        ) : null}
      </div>

      <p className="mt-5 text-sm leading-6 text-[var(--marketing-text-muted)]">{summary}</p>

      <ul className="mt-6 flex-1 space-y-3 text-sm leading-6 text-[var(--marketing-text-muted)]">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <RiCheckLine
              className="mt-0.5 size-4 shrink-0 text-[var(--marketing-accent)]"
              aria-hidden="true"
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* External links to the app or a mailto. Anchor (not Link) because
          we're leaving the marketing-site origin in both cases. */}
      <a
        href={cta.href}
        className={
          highlight
            ? "mt-8 inline-flex items-center justify-center rounded-full bg-[var(--marketing-accent)] px-5 py-3 text-sm font-bold uppercase tracking-widest text-[var(--marketing-primary-text)] shadow-[0_12px_32px_rgba(0,0,0,0.3)] transition-all hover:scale-[1.02]"
            : "mt-8 inline-flex items-center justify-center rounded-full border border-[var(--marketing-border-strong)] bg-[var(--marketing-surface)] px-5 py-3 text-sm font-bold uppercase tracking-widest text-[var(--marketing-text)] transition-all hover:border-[var(--marketing-text)] hover:bg-[var(--marketing-surface-muted)]"
        }
      >
        {cta.label}
      </a>
    </motion.article>
  );
}

function FaqRow({ question, answer }: { question: string; answer: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[1.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6"
    >
      <p className="text-base font-bold tracking-tight text-[var(--marketing-text)]">{question}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--marketing-text-muted)]">{answer}</p>
    </motion.div>
  );
}
