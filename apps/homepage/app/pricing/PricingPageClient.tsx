"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RiCheckLine } from "react-icons/ri";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import {
  SALES_CONTACT_EMAIL,
  SUPPORTED_CURRENCIES,
  formatPlanCyclePrice,
  formatPlanPrice,
  getPlanPrice,
  type BillingPlanId,
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

// Tier CTAs anchor to the on-page waitlist form (#waitlist) — the whole
// public funnel is waitlist-gated (URG-125/URG-136); only the header's
// Login / Start free links still go straight to the app. The old in-app
// subscribe entry was https://app.urganize.app/locked — restore that href
// here if the funnel ever reopens to direct signup.

// Per-tier marketing copy. Keep the rhythm short and declarative.
//
// "Templates" intentionally says "single-release" only. EP, album, and
// music-video templates are scoped for v2 — same honesty rule as the
// pricing itself, we don't advertise what isn't built.
//
// The 28-day trial line was removed from this list because it's plan-
// agnostic (the trial applies to both Monthly and Annual). With the funnel
// waitlist-gated it no longer appears in the hero either — the trial is
// only mentioned in the FAQ, as the answer to the question, not as a CTA.
//
// Refreshed 2026-07-14 (alongside the pricing reprice) with two bullets for
// capability that shipped since this list was last written: light/dark mode
// and real-time notifications. Chappi is deliberately NOT listed — it's
// flag-gated off in production (NEXT_PUBLIC_FEATURE_CHAPPI defaults false),
// and this page doesn't advertise what isn't live yet.
const MONTHLY_FEATURES = [
  "Unlimited releases on one workspace",
  "Hand-crafted single-release rollout template",
  "Tasks with assignees, dependencies, due dates",
  "Per-release file storage for masters, artwork, contracts",
  "Event milestones: listening parties, video shoots, release day",
  "Invite your A&R, PR, distributor",
  "Light and dark mode, matching your system automatically",
  "Real-time notifications when things change on your releases",
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
  "Billed once: one invoice, no monthly admin",
  "Best for teams committed to a release year",
  "Lock in current pricing for a year",
] as const;

// Label tier benefits are service commitments the founders deliver
// directly (onboarding, template tailoring, roster setup) on top of
// everything in Annual — keep them honest and deliverable.
const LABEL_FEATURES = [
  "Everything in Annual",
  "Roster onboarding: we set up every artist's releases with you",
  "Release templates tailored to how your label actually works",
  "Hands-on onboarding for your whole team",
  "Priority support with a direct line to the founders",
] as const;

// Shared between the on-page FAQ rows and the FAQPage JSON-LD below so the
// two never drift.
const FAQ_ITEMS = [
  {
    question: "Can I try Urganize first?",
    answer:
      "Yes. The 28-day free trial doesn't ask for a card. Start it from the app. Once it ends, pick a plan or stop using it.",
  },
  {
    question: "What's actually different between monthly and annual?",
    answer:
      "The same workspace, same features. Annual is one invoice instead of twelve — the plan for teams already committed to their release calendar for the year.",
  },
  {
    question: "Do I pay per teammate?",
    answer:
      "No. One workspace, one price. Invite your A&R, PR, and distributor at no extra cost.",
  },
  {
    question: "Who is the Label plan for?",
    answer:
      "Labels and management companies running a roster. Same workspace, plus the founders work with you directly: we onboard each artist's releases, tailor the templates to your workflow, and stay a message away on priority support.",
  },
  {
    question: "How does billing work?",
    answer:
      "Paystack processes the card. We charge in NGN or USD, your choice. You can cancel anytime from Settings and keep access through the period you paid for.",
  },
] as const;

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    "name": item.question,
    "acceptedAnswer": {
      "@type": "Answer",
      "text": item.answer,
    },
  })),
} as const;

const MONTHLY_SUMMARY = "Billed every month. Full access, no long-term commitment.";
const ANNUAL_SUMMARY = "Billed once a year. Built for teams running a full release calendar.";
const LABEL_SUMMARY =
  "For labels and management companies running a roster. Priced to your roster, set up with the founders directly.";

function monthlyEquivalent(plan: BillingPlanId, currency: PricingCurrencyCode): string {
  // Marketing context only — we round to a familiar number rather than
  // showing the exact 1/12 division. Source of truth is the yearly amount
  // in the shared package; this is a labeled approximation.
  const yearly = getPlanPrice(plan, currency).amount;
  const monthlyEquiv = yearly / 12;
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

export function PricingPageClient({
  initialCurrency,
}: {
  initialCurrency: PricingCurrencyCode;
}) {
  // Initial value is geo-resolved server-side (see page.tsx): NGN for
  // Nigerian visitors, USD everywhere else. The toggle below still lets
  // anyone switch manually.
  const [currency, setCurrency] = useState<PricingCurrencyCode>(initialCurrency);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--marketing-bg)] font-sans text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)]">
      {/* Shared marketing header — one nav across all marketing pages.
          Card CTAs anchor to the on-page waitlist form; the header keeps
          the only direct path into the app. */}
      <MarketingHeader />

      <main className="relative z-10">
        {/* HERO */}
        <section className="relative px-6 pb-12 pt-14 sm:pt-20">
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
              One workspace, every release your team runs. Join the waitlist and
              we&apos;ll reach out.
            </motion.p>

            {/* Currency toggle. Default is geo-resolved (NGN in Nigeria,
                USD elsewhere). Sticky in local state for this session; no
                persistence — the in-app /locked screen has its own toggle
                with the same options. */}
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
              cta={{ label: "Join now", href: "#waitlist" }}
            />
            <PricingTierCard
              name="Annual"
              price={formatPlanCyclePrice("annual", currency)}
              priceSubline={monthlyEquivalent("annual", currency)}
              summary={ANNUAL_SUMMARY}
              features={ANNUAL_FEATURES}
              cta={{ label: "Join now", href: "#waitlist" }}
              highlight
              badge="Best value"
            />
            {/* Label is sales-led (contactSales in @urganize/pricing): no
                price, no monthly-equivalent — a roster deal is scoped and
                quoted per label, so the CTA opens an email to the founders
                instead of the waitlist. */}
            <PricingTierCard
              name="Label"
              price="Contact us"
              summary={LABEL_SUMMARY}
              features={LABEL_FEATURES}
              cta={{
                label: "Talk to the founders",
                href: `mailto:${SALES_CONTACT_EMAIL}?subject=${encodeURIComponent("Urganize Label plan enquiry")}`,
              }}
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
              {FAQ_ITEMS.map((item) => (
                <FaqRow key={item.question} question={item.question} answer={item.answer} />
              ))}
            </div>
          </div>
        </section>

        {/* WAITLIST — the target of every tier card's "Join now" anchor.
            scroll-mt keeps the heading clear of the fixed header on jump. */}
        <section id="waitlist" className="relative scroll-mt-28 px-6 pb-28">
          <div className="mx-auto max-w-3xl text-center">
            <motion.h2
              {...fadeInUp}
              className="text-3xl font-black tracking-tight md:text-4xl"
            >
              Ready when you are.
            </motion.h2>
            <div className="mt-8">
              <WaitlistForm source="pricing" />
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
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
          ? "relative flex h-full flex-col rounded-[2rem] border border-[var(--marketing-accent)]/40 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--marketing-accent)_12%,transparent),var(--marketing-surface-muted))] p-8 shadow-[0_24px_80px_var(--marketing-shadow-strong)] backdrop-blur-xl"
          : "relative flex h-full flex-col rounded-[2rem] border border-[color:var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-8 shadow-[0_24px_70px_var(--marketing-shadow)] backdrop-blur-xl"
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
            ? "mt-8 inline-flex items-center justify-center rounded-full bg-[var(--marketing-primary)] px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_12px_32px_var(--marketing-shadow-strong)] hover:bg-[var(--marketing-primary-hover)]"
            : "mt-8 inline-flex items-center justify-center rounded-full border border-[var(--marketing-border-strong)] bg-[var(--marketing-surface)] px-5 py-3 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-text)] hover:border-[var(--marketing-text)] hover:bg-[var(--marketing-surface-muted)]"
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
