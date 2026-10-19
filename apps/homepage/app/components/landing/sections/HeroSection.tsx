import { PRODUCT_SHOTS } from "@/content/product-shots";
import { ProofLine } from "../ProofLine";
import { ResponsiveProductShot } from "../ResponsiveProductShot";
import { SectionShell } from "../SectionShell";
import { WaitlistForm } from "../WaitlistForm";
import { WatchDemo } from "../WatchDemo";
import { wideContainerClass } from "./shared";
import { HeroCards, HeroSky } from "./HeroDawn";
import { HeroShotTabs } from "../HeroShotTabs";

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
        <p className="hero-fade-in hero-delay-1 mono-label text-[var(--marketing-accent)]">
          For artist managers
        </p>
        <h1 className="hero-fade-in hero-delay-1 mt-6 text-balance text-[2.6rem] leading-[1.05] text-[var(--marketing-text)] sm:text-[3.8rem] lg:text-[4.6rem]">
          Every release, <span className="text-[var(--marketing-accent)]">on plan.</span>
        </h1>
        <p className="hero-fade-in hero-delay-2 mx-auto mt-6 max-w-[40rem] text-[1.05rem] leading-8 text-[var(--marketing-text-muted)] sm:text-[1.25rem] sm:leading-9">
          Add a release and everyone knows their job till drop day.
          <br />
          You stop being the team’s reminder app.
        </p>

        {/* z-[60] keeps the form above the hero-fade-in transform stack and
            below the demo overlay's z-[100]. */}
        <div className="hero-fade-in hero-delay-3 relative z-[60] mt-9 flex w-full flex-col items-center gap-5">
          <WaitlistForm
            source="homepage_hero"
            buttonLabel="Join the waitlist"
            hint="IN PUBLIC BETA"
            accent
          />
          <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
            <WatchDemo variant="link" />
          </p>
          <ProofLine
            id="zaddyfunds"
            className="mt-2 w-full max-w-[30rem] border-t border-[color:var(--marketing-border)] pt-5"
          />
        </div>
      </div>

      {/* Below `sm` the frame is a 4:5 window onto the top of the phone
          capture; from `sm` the desktop capture renders at its own aspect. */}
      {/* The sky is anchored to this wrapper, so its horizon sits on the
          shot's top edge whatever height the text above it wraps to. */}
      <div className="relative mx-auto mt-14 max-w-[84rem] sm:mt-16">
        <HeroSky />
        <div className="hero-shot-frame relative aspect-[4/5] overflow-hidden rounded-xl border border-[color:var(--marketing-border)] sm:aspect-auto">
          {/* The Artists | Rollouts tabs drawn in the capture are tappable
              (URG-378): Rollouts is the default and stays the LCP image. */}
          <HeroShotTabs
            rollouts={
              <ResponsiveProductShot
                desktop={PRODUCT_SHOTS.catalog}
                phone={PRODUCT_SHOTS.catalogPhone}
                alt="The Urganize catalog for a manager running several artists: release cards with cover art, the release date and a progress bar counting finished tasks against each plan."
                sizes={HERO_SHOT_SIZES}
                className="h-full w-full object-cover object-top sm:h-auto sm:object-contain"
              />
            }
            artists={
              <ResponsiveProductShot
                desktop={PRODUCT_SHOTS.artistsRoster}
                phone={PRODUCT_SHOTS.artistsPhone}
                alt="The Urganize artists roster: every artist the manager runs, with how many releases each has in plan."
                sizes={HERO_SHOT_SIZES}
                fetchPriority="low"
                className="absolute inset-0 h-full w-full object-cover object-top"
              />
            }
          />
        </div>
      </div>
    </SectionShell>
  );
}
