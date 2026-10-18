"use client";

import { ProofLine } from "../components/landing/ProofLine";
import { ScrollReveal } from "../components/landing/ScrollReveal";
import { WaitlistForm } from "../components/landing/WaitlistForm";
import { MarketingFooter } from "../components/marketing/MarketingFooter";
import { MarketingHeader } from "../components/marketing/MarketingHeader";
import { PricingTierCards } from "../components/pricing/PricingTierCards";
import { AUDIENCE_LINE, CORE_LINE } from "@/lib/positioning";
import { PageDawn } from "../components/marketing/PageDawn";

// THE PRICE TABLE IS UNCONDITIONAL. Do not put it back behind a flag.
//
// It shipped on 2026-08-24 gated by NEXT_PUBLIC_FEATURE_PRICING_V2, because
// showing prices REVERSES the founder's 2026-07-23 book-a-demo decision and a
// flag made that reversal revertible from a dashboard. That gate was removed a
// day later, after it failed twice in production, and the reason is worth
// keeping: the flag was read at module scope, so Next inlined it at BUILD time.
// Flipping it therefore needed three things to line up at once — the var set on
// the right one of TWO Vercel projects, and a commit touching this app, and a
// deploy that turbo-ignore did not skip. Twice it did not, and the page kept
// serving a bundle with `false` compiled into it while the env var said
// otherwise.
//
// What made removing the gate the right trade rather than a shortcut: THIS PAGE
// HAS NO RISK SURFACE. Every CTA is a mailto in both modes and nothing here
// links to app.urganize.app, so the rollback lever was never protecting money —
// it was protecting a headline. Reverting it is a one-line code change either
// way.
//
// NEXT_PUBLIC_FEATURE_PRICING_V2 IS STILL LIVE, in apps/web, where it gates
// tier checkout, the picker on /locked, plan changes and the entitlement
// resolver. So the two surfaces CAN now legitimately disagree, and the safe
// direction is the one they disagree in: this page can advertise a tier the app
// cannot yet sell, because `purchasableTiers()` in apps/web withholds any tier
// whose Paystack Plan is unminted and the visitor simply does not meet it at the
// wall. The reverse — an app selling what the site never mentioned — would be
// the surprise. If a public figure ever needs suppressing again, edit this file.
//
// Two notes on the CTAs, the first of which has moved twice:
//   * "EVERY CTA IS A CAPTURE" WAS THE RULE UNTIL 2026-09-02, when Solo and
//     Manager started sending visitors to a free trial. Since 2026-09-08 Label
//     does too, so all THREE cards start a trial now — and since 2026-09-09,
//     when Group was removed, there is no fourth card left to email us at all.
//     What the old rule was really protecting is intact: nobody lands in the
//     product without an account, because APP_SIGNUP_URL is /onboarding rather
//     than the login-only /auth.
//   * This is NOT the pre-2026-07-23 layout (Monthly/Annual/Label cards,
//     geo-resolved currency toggle, billing FAQ + JSON-LD). That one sold legacy
//     plans in two currencies on a monthly/annual toggle; the tier model is
//     NGN-only and annual-only by design. It is in git history if anyone needs
//     it.

// ANIMATION: CSS, not framer-motion (2026-08-08 performance pass).
//
// This page was the only framer-motion consumer on the whole site, and it used
// it for thirteen plain fade/slide-ins — every one of which the site already
// expresses in CSS everywhere else: `hero-fade-in` + `hero-delay-*` for the
// on-load hero stagger, `<ScrollReveal>` (an IntersectionObserver toggling a
// class) for reveal-on-scroll. Shipping an animation library to /pricing to
// duplicate that was pure weight on a page a visitor may load on a slow phone.
// Delays match the previous ones almost exactly (0.2s / 0.4s / 0.6s).

export function PricingPageClient() {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden bg-[var(--marketing-bg)] font-sans text-[var(--marketing-text)] selection:bg-[var(--marketing-selection)]">
      <MarketingHeader />

      <main className="relative z-10 isolate overflow-x-clip">
        {/* HERO */}
        <section className="relative px-6 pb-16 pt-14 sm:pt-20">
          <PageDawn className="mx-auto max-w-4xl text-center">
            <div className="hero-fade-in mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--marketing-accent)]/30 bg-[var(--marketing-accent)]/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--marketing-accent)]">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-[var(--marketing-accent)]" />
              Pricing
            </div>

            <h1 className="hero-fade-in hero-delay-1 mb-8 text-5xl font-black leading-[0.95] tracking-tighter sm:text-6xl md:text-7xl">
              One price.
              <br />
              <span className="text-[var(--marketing-accent)]">Your whole team.</span>
            </h1>

            {/* Plain-language pass 2026-08-30. The headline used to be "Priced
                by the size of your roster" — true, but an abstract construction
                where the concrete promise (one price, not per person) was buried
                in the lead below it. The lead keeps the locked positioning
                sentence (the founder's core line since 2026-09-24) and drops
                what the headline now says. Composed from lib/positioning, so it
                cannot drift from the homepage and the footer. */}
            <p className="hero-fade-in hero-delay-2 mx-auto max-w-xl text-lg leading-relaxed text-[var(--marketing-text-muted)] md:text-xl">
              {CORE_LINE} Join the waitlist, and let us set your roster up
              with you.
            </p>

            <div className="hero-fade-in hero-delay-3 mt-10">
              {/* NO hero CTA, deliberately: every card below already carries
                  its own, and one more button up here reads as a button
                  repeated rather than as a choice. The header's "Try Urganize"
                  is on screen throughout anyway. */}
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--marketing-text-subtle)]">
                Built for {AUDIENCE_LINE}.
              </p>
              {/* The Founding Member line ("Only 10 founding spots. Your price
                  never goes up.") was removed 2026-10-17: founder call, "no
                  founding members". Everyone pays the list price, and the
                  2026-10-17 Manager reprice applies to existing teams too. */}
            </div>
          </PageDawn>
        </section>

        <PricingTierCards />

        {/* THE "HOW THE GROUP PLAN WORKS" THREE-STEP SECTION THAT USED TO SIT
            HERE IS DELETED, not merely reworded — REMOVED 2026-09-09, the same
            pass that took Group off the ladder entirely. It walked through a
            reach-out / demo-call / agree-a-price flow, and that flow was
            EXCLUSIVELY Group's: the comment above it, right up to the moment of
            removal, said outright "Group is the only card this describes now".
            With every remaining tier self-serve (Solo, Manager, Label all send
            a visitor straight to the free trial), there is no sales
            conversation left on this page for three steps to describe — keeping
            a "How the Group plan works" heading above cards that no longer
            include Group would have been a worse inconsistency than a stale
            comment. If a sales-led tier is ever reintroduced, git history has
            the three cards (title, step number, body) verbatim to restore. */}

        {/* WAITLIST — the secondary path for anyone not ready to talk yet.
            Same capture pipeline as the rest of the marketing site
            (URG-125/URG-136). */}
        <section id="waitlist" className="relative scroll-mt-28 px-6 pb-28">
          <div className="mx-auto max-w-3xl text-center">
            <ScrollReveal>
              <h2 className="text-3xl font-black tracking-tight md:text-4xl">
                Not ready to talk yet?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-[var(--marketing-text-muted)]">
                Leave your email. We&apos;ll reach out when the time is right
                for your team.
              </p>
            </ScrollReveal>
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
