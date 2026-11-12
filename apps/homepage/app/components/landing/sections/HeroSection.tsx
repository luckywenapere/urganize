import { HERO_EYEBROW, HERO_HEADLINE, HERO_SUBHEAD } from "@/lib/positioning";
import { ProofStats } from "../ProofStats";
import { VisitorPrice } from "@/app/components/pricing/VisitorPrice";
import { getTier, PRICING_TIER_ORDER } from "@urganize/pricing";

import { ProofLine } from "../ProofLine";
import { ResponsiveProductShot } from "../ResponsiveProductShot";
import { SectionShell } from "../SectionShell";
import { WaitlistForm } from "../WaitlistForm";
import { TrialButton } from "../TrialButton";
import { PRIMARY_CTA, SIGNUP_OPEN } from "@/lib/app-urls";
import { WatchDemo } from "../WatchDemo";
import { wideContainerClass } from "./shared";
import { HeroCards, HeroSky } from "./HeroDawn";
import { HeroLoop } from "../hero-loop/HeroLoop";
import { HERO_LOOP_POSTER } from "../hero-loop/poster";

// The cheapest paid plan, read from @urganize/pricing like the pricing strip
// does, so the hero never quotes a typed price.
const FIRST_PAID_TIER = PRICING_TIER_ORDER.find((id) => {
  const tier = getTier(id);
  return !tier.contactSales && (tier.monthlyPrice?.amount ?? 0) > 0;
});

// The headline's second half takes the accent colour, split at its comma so
// the words come from lib/positioning.ts and are never typed here.
const HERO_SPLIT = HERO_HEADLINE.indexOf(", ");
const HERO_LEAD = HERO_SPLIT === -1 ? HERO_HEADLINE : HERO_HEADLINE.slice(0, HERO_SPLIT + 1);
const HERO_ACCENT = HERO_SPLIT === -1 ? "" : HERO_HEADLINE.slice(HERO_SPLIT + 2);

const HERO_SHOT_SIZES = "(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw";

// Homepage v2 hero (2026-10-17, URG-334; founder approved 2026-10-17).
//
// THE FIVE-SECOND TEST. The 2026-09-24 hero ("Everything after the music." +
// "Urganize is where music teams do everything after the music is made.")
// said neither what the product does nor who it is for, and the subhead
// repeated the headline. The label names the buyer, the H1 the outcome and the
// sub the three steps the page then shows as A, B and C. On approval the H1
// became SHORT_LINE and the sub PROMISE_LINE in lib/positioning.ts, so the
// page title, meta description, JSON-LD, share card and footer say the same.
//
// THE FORM IS IN THE HERO. Urganize is a waitlist (founder, 2026-10-16: all
// public copy points to the waitlist, never open sign-up), and every
// "Try Urganize" button used to jump ~6,000px to a form at the foot of the
// page, a promise ("try") the page then broke. Now the header button lands
// here (`/#waitlist`), the one accent action on the first screen is this
// form, and the same form repeats at the end. scroll-mt-28 keeps the label
// clear of the fixed header when the anchor is followed.
//
// RELEASE DAWN (2026-10-18, URG-376, founder approved the mock). One arm of an
// A/B: under html[data-hero-variant="dawn"] a CSS sky rises behind the
// product shot and four cards float in the desktop gutters (HeroDawn.tsx).
// The other arm, "flat", renders exactly the hero above. `isolate` keeps the
// sky's z-index:-1 inside this section, above the page background.
export function HeroSection() {
  return (
    <SectionShell
      className="hero-section isolate pb-16 pt-16 sm:pb-20 sm:pt-24 lg:pb-24 lg:pt-28"
      containerClassName={wideContainerClass}
    >
      <div
        id="waitlist"
        className="relative mx-auto flex max-w-[60rem] scroll-mt-28 flex-col items-center text-center"
      >
        <HeroCards />
        {/* THE COFRAME HEADLINE (founder, 2026-11-12, #1224: accept every
            Coframe recommendation). The headline names the job, the line
            under it names who it is for, and the 2026-11-09 headline sits
            above as the label. All three are in lib/positioning.ts. */}
        <p className="hero-fade-in hero-delay-1 mono-label text-balance text-[var(--marketing-accent)]">
          {HERO_EYEBROW}
        </p>
        <h1 className="hero-fade-in hero-delay-1 mt-6 text-balance text-[2.6rem] leading-[1.05] text-[var(--marketing-text)] sm:text-[3.8rem] lg:text-[4.6rem]">
          {HERO_LEAD} <span className="block text-[var(--marketing-accent)]">{HERO_ACCENT}</span>
        </h1>
        <p className="hero-fade-in hero-delay-2 mx-auto mt-6 max-w-[40rem] text-balance text-[1.05rem] leading-8 text-[var(--marketing-text-muted)] sm:text-[1.25rem] sm:leading-9">
          {HERO_SUBHEAD}
        </p>

        {/* z-[60] keeps the form above the hero-fade-in transform stack and
            below the demo overlay's z-[100]. */}
        <div className="hero-fade-in hero-delay-3 relative z-[60] mt-9 flex w-full flex-col items-center gap-5">
          {/* Open sign-up (2026-11-10, #1177): a button straight into the app
              (public beta; the team picks a plan there). The waitlist form
              comes back if SIGNUP_OPEN is turned off. */}
          {SIGNUP_OPEN ? (
            <div className="flex w-full flex-col items-center gap-3">
              {/* The main button names what the visitor gets, echoing "Get a
                  plan that fits" (#1220). It still opens sign-up, which then
                  asks about the goals and builds the plan. The header button
                  keeps "Create your account". The demo sits beside it as a
                  real second button, not a small link. */}
              <div className="flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
                <TrialButton location="hero" size="lg" label="Build my release plan" className="w-full sm:w-auto" />
                <WatchDemo variant="ghost" className="w-full sm:w-auto" />
              </div>
              <p className="mono-label text-[var(--marketing-text-subtle)]">{PRIMARY_CTA.hint}</p>
              {FIRST_PAID_TIER ? (
                <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
                  Plans from <VisitorPrice tierId={FIRST_PAID_TIER} />.
                </p>
              ) : null}
            </div>
          ) : (
            <WaitlistForm
              source="homepage_hero"
              buttonLabel={PRIMARY_CTA.label}
              hint={PRIMARY_CTA.hint}
              accent
            />
          )}
          {SIGNUP_OPEN ? null : (
            <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
              <WatchDemo variant="link" />
            </p>
          )}
          {/* Real numbers from our own data, beside the main action (#1224). */}
          <ProofStats className="mt-1" />
          <ProofLine
            id="zaddyfunds"
            className="mt-2 w-full max-w-[30rem] border-t border-[color:var(--marketing-border)] pt-5"
          />
        </div>
      </div>

      {/* THE HERO LOOP (2026-11-01, #952, founder approved the mock; notes in
          docs/notes/2026-11-01-hero-loop.md): add a release, the plan
          appears, the tasks land on the team. The poster still is
          server-rendered and stays the LCP image; HeroLoop lazy-loads the
          animation over it after load, and never under reduced motion. Below
          `sm` both are the phone design (358x540), from `sm` the desktop one
          (1000x560). The sky is anchored to this wrapper, so its horizon sits
          on the shot's top edge whatever height the text above it wraps to;
          hero-shot-frame gives the dawn arm its lift shadow. */}
      <div className="relative mx-auto mt-14 max-w-[84rem] sm:mt-16">
        <HeroSky />
        <HeroLoop className="hero-shot-frame rounded-t-xl">
          <div className="hero-loop-poster">
            <ResponsiveProductShot
              desktop={HERO_LOOP_POSTER.desktop}
              phone={HERO_LOOP_POSTER.phone}
              alt="An Urganize release plan for the single Harmattan Gold: six tasks with due dates, each with a teammate's name next to it."
              sizes={HERO_SHOT_SIZES}
              className="block h-auto w-full"
            />
          </div>
        </HeroLoop>
      </div>
    </SectionShell>
  );
}
