"use client";

import { motion } from "framer-motion";
import { RiArrowRightLine } from "react-icons/ri";
import { ProofLine } from "../components/landing/ProofLine";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { SALES_CONTACT_EMAIL } from "@urganize/pricing";

// BOOK-A-DEMO MODE (founder decision, 2026-07-23)
//
// The price table is deliberately gone. The founders want to talk to every
// team that wants to use Urganize before any money changes hands, so this
// page's one job is to start that conversation — not to sell a tier.
//
// The old three-tier layout (Monthly/Annual/Label cards reading
// @urganize/pricing, geo-resolved currency toggle, billing FAQ + JSON-LD)
// lives in git history on this file — restore from there if self-serve
// pricing ever returns. @urganize/pricing itself is untouched; the in-app
// billing plumbing still reads it.

const DEMO_MAILTO = `mailto:${SALES_CONTACT_EMAIL}?subject=${encodeURIComponent("Book an Urganize demo")}`;

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: {
    duration: 0.6,
    ease: [0.22, 1, 0.36, 1] as const,
  },
};

export function PricingPageClient() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--marketing-bg)] font-sans text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)]">
      <MarketingHeader />

      <main className="relative z-10">
        {/* HERO */}
        <section className="relative px-6 pb-16 pt-14 sm:pt-20">
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
              No price table.
              <br />
              <span className="text-[var(--marketing-accent)]">Book a demo.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="mx-auto max-w-xl text-lg leading-relaxed text-[var(--marketing-text-muted)] md:text-xl"
            >
              Urganize gives your music the release it deserves. Right now we
              set up every team personally. You show us your roster. We show
              you the product. We take it from there.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="mt-10"
            >
              <a
                href={DEMO_MAILTO}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_12px_32px_var(--marketing-shadow-strong)] hover:bg-[var(--marketing-primary-hover)]"
              >
                Book a demo
                <RiArrowRightLine className="size-4" aria-hidden="true" />
              </a>
              <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-[var(--marketing-text-subtle)]">
                Built for artist managers and small labels running more than one artist.
              </p>
            </motion.div>
          </div>
        </section>

        {/* WHAT A DEMO LOOKS LIKE — plain-language expectations so "demo"
            doesn't read as a sales gauntlet. Three short beats. */}
        <section className="relative px-6 pb-20">
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
            {(
              [
                {
                  step: "01",
                  title: "You reach out",
                  body: "One email. Tell us who you manage and what's coming up on your calendar.",
                },
                {
                  step: "02",
                  title: "We run one together",
                  body: "A short call where we run one of your actual releases through Urganize with you.",
                },
                {
                  step: "03",
                  title: "You start planning",
                  body: "If it fits, we set your team up ourselves. Releases, rollout plans, and activities, ready to go.",
                },
              ] as const
            ).map((item) => (
              <motion.div
                key={item.step}
                {...fadeInUp}
                className="rounded-[1.5rem] border border-[var(--marketing-border)] bg-[var(--marketing-surface-muted)] p-6"
              >
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                  {item.step}
                </p>
                <p className="mt-3 text-base font-bold tracking-tight text-[var(--marketing-text)]">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--marketing-text-muted)]">
                  {item.body}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* WAITLIST — the secondary path for anyone not ready to talk yet.
            Same capture pipeline as the rest of the marketing site
            (URG-125/URG-136). */}
        <section id="waitlist" className="relative scroll-mt-28 px-6 pb-28">
          <div className="mx-auto max-w-3xl text-center">
            <motion.h2
              {...fadeInUp}
              className="text-3xl font-black tracking-tight md:text-4xl"
            >
              Not ready to talk yet?
            </motion.h2>
            <motion.p
              {...fadeInUp}
              className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--marketing-text-muted)]"
            >
              Leave your email and we&apos;ll get in touch when the time is
              right for your team.
            </motion.p>
            <div className="mt-8">
              <WaitlistForm source="pricing" />
              <ProofLine id="zaddyfunds" className="mt-4" />
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
