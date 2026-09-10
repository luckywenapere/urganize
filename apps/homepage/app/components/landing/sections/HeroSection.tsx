import { PRODUCT_SHOTS } from "@/content/product-shots";
import { AUDIENCE_LINE, PRODUCT_CATEGORY, PROMISE } from "@/lib/positioning";
import { ProofLine } from "../ProofLine";
import { ResponsiveProductShot } from "../ResponsiveProductShot";
import { SectionShell } from "../SectionShell";
import { TrialButton } from "../TrialButton";
import { WatchDemo } from "../WatchDemo";
import { wideContainerClass } from "./shared";

// The hero, rebuilt 2026-09-02 for the buyer who actually converts: the
// manager or small label running several artists' releases (founder call,
// reversing the 2026-08-19 "executives are the hero" brief). The 2026-09-09
// positioning is what binds now: artists lead the audience, no "workspace",
// no "ship". "From one place" is the promise rather than a banned container
// metaphor, which is the one rule of the 2026-08-19 brief that flipped; its
// other rules still hold, no "system of record", fifth-grade readability, no
// Oxford comma in house copy.
//
// One ask. The primary button is the free trial, straight into the app
// (APP_SIGNUP_URL): since 2026-08-30 the two lowest tiers are self-serve, so
// a visitor who can start today is no longer queued behind a waitlist form.
// The old hero form and its `id="waitlist"` anchor are gone — nothing has
// linked to /#waitlist since the header's CTA changed — and the waitlist
// survives as a disclosure under the final CTA (WaitlistDisclosure).
//
// The demo is an inline text link at the tail of the terms line rather than a
// second pill: on a phone the button, its terms and the proof quote must all
// fit the first screen, and a second pill pushed the proof below the fold.
//
// The first product visual on the page since the Aug 1 catalog capture came
// off the fold: art-directed, the phone capture below `sm` and the desktop
// capture above it (see ResponsiveProductShot). Top edge visible in the first
// desktop viewport; on a phone it is the second screen, so no `priority`.
export function HeroSection() {
  return (
    <SectionShell
      className="pb-16 pt-20 sm:pb-20 sm:pt-24 lg:pb-24 lg:pt-28"
      containerClassName={wideContainerClass}
    >
      <div className="mx-auto flex max-w-[64rem] flex-col items-center text-center">
        <div className="flex flex-col items-center gap-8 sm:gap-10">
          {/* THE CATEGORY IS THE HEADLINE (2026-09-09 positioning). The brief
              fixes the hierarchy for anything that introduces the product:
              category first, audience second, promise third, explanation last.
              So the h1 is the customer line verbatim and the subhead opens
              with the promise.

              It reads as a definition rather than a benefit, which is the
              deliberate trade: the line it replaced ("One artist or ten, every
              release runs to plan") was a better sentence and told a visitor
              who had never heard of us nothing about what this IS.

              Composed from the shared constants rather than typed out, so the
              h1, the meta description and the share card cannot drift apart —
              the accent falls on the category because that is the half worth
              remembering. */}
          <h1 className="hero-fade-in hero-delay-1 mx-auto max-w-[20ch] text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem] lg:text-[5.2rem]">
            <span className="italic text-[var(--marketing-accent)]">
              {PRODUCT_CATEGORY}
            </span>{" "}
            for {AUDIENCE_LINE}.
          </h1>

          <p className="hero-fade-in hero-delay-2 mx-auto block w-full max-w-[44rem] text-balance text-center text-lg leading-8 text-[var(--marketing-text-muted)] sm:text-[1.25rem] sm:leading-9">
            {PROMISE}. Urganize lays out the full rollout, you put a name on
            every activity, and your team sees where each rollout stands.
          </p>
        </div>

        {/* z-[60] keeps the CTA block above the hero-fade-in transform stack
            (the same tier the old form block held), below the demo overlay's
            z-[100]. */}
        <div className="hero-fade-in hero-delay-3 relative z-[60] mt-9 flex w-full flex-col items-center gap-4">
          <TrialButton location="hero" size="lg" className="w-full sm:w-auto" />
          <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
            3 days free. No card. Your whole team. Or <WatchDemo variant="link" />.
          </p>
          {/* Proof directly under the primary CTA (2026-07-31): zaddyfunds'
              quote is the shortest and the only publicly link-verifiable
              one — the highest credibility per pixel, right where the
              decision is made. */}
          <ProofLine
            id="zaddyfunds"
            className="mt-3 w-full max-w-[30rem] border-t border-[color:var(--marketing-border)] pt-5"
          />
        </div>
      </div>

      {/* Below `sm` the frame is a 4:5 window onto the top of the phone
          capture (a full 390x844 screenshot at full width is a whole phone
          screen of image); from `sm` the desktop capture renders at its own
          aspect. */}
      <div className="mx-auto mt-14 aspect-[4/5] max-w-[84rem] overflow-hidden rounded-xl border border-[color:var(--marketing-border)] sm:mt-16 sm:aspect-auto">
        <ResponsiveProductShot
          desktop={PRODUCT_SHOTS.catalog}
          phone={PRODUCT_SHOTS.catalogPhone}
          alt="The Urganize catalog for a team running several artists: release cards with cover art, the release date and a progress bar counting finished activities against each plan."
          sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 80px), 100vw"
          className="h-full w-full object-cover object-top sm:h-auto sm:object-contain"
        />
      </div>
    </SectionShell>
  );
}
