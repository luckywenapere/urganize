import { PRODUCT_SHOTS } from "@/content/product-shots";
import { CORE_LINE, SHORT_LINE } from "@/lib/positioning";
import { ProofLine } from "../ProofLine";
import { ResponsiveProductShot } from "../ResponsiveProductShot";
import { SectionShell } from "../SectionShell";
import { TrialButton } from "../TrialButton";
import { WatchDemo } from "../WatchDemo";
import { wideContainerClass } from "./shared";

// The hero, rebuilt 2026-09-02 for the buyer who actually converts: the
// manager running several artists' releases (founder call, reversing the
// 2026-08-19 "executives are the hero" brief). What binds the copy now is the
// 2026-09-24 positioning: you make the music, Urganize is where your team does
// everything after. No "workspace", no "ship", no em dashes, fifth-grade
// readability, no Oxford comma in house copy.
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
// The words of the headline that carry the accent. Found in SHORT_LINE rather
// than typed out as three fragments, so the h1 stays the founder's short line
// verbatim; if the line ever changes and the phrase is gone, the whole line
// renders unaccented instead of breaking.
const HEADLINE_ACCENT = "after the music";
const accentAt = SHORT_LINE.indexOf(HEADLINE_ACCENT);
const headlineBefore = accentAt >= 0 ? SHORT_LINE.slice(0, accentAt) : SHORT_LINE;
const headlineAccent = accentAt >= 0 ? HEADLINE_ACCENT : "";
const headlineAfter =
  accentAt >= 0 ? SHORT_LINE.slice(accentAt + HEADLINE_ACCENT.length) : "";

export function HeroSection() {
  return (
    <SectionShell
      className="pb-16 pt-20 sm:pb-20 sm:pt-24 lg:pb-24 lg:pt-28"
      containerClassName={wideContainerClass}
    >
      <div className="mx-auto flex max-w-[64rem] flex-col items-center text-center">
        <div className="flex flex-col items-center gap-8 sm:gap-10">
          {/* THE SHORT LINE IS THE HEADLINE AND THE CORE LINE IS THE SUBHEAD
              (2026-09-24 positioning). Both are the founder's words verbatim,
              and nothing else is on the fold above the button.

              The 2026-09-11 call still holds: no explanation sentence after
              the subhead. Do not add one back here without asking. What the
              product does in detail reaches search and social through
              LANDING_DESCRIPTION (the founder's long description) and the
              share card either way.

              Composed from the shared constants rather than typed out, so the
              h1, the meta description and the share card cannot drift apart.
              The accent falls on "after the music" because that is the idea
              worth remembering. */}
          <h1 className="hero-fade-in hero-delay-1 mx-auto max-w-[20ch] text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.2rem] lg:text-[5.2rem]">
            {headlineBefore}
            {headlineAccent ? (
              <span className="italic text-[var(--marketing-accent)]">
                {headlineAccent}
              </span>
            ) : null}
            {headlineAfter}
          </h1>

          <p className="hero-fade-in hero-delay-2 mx-auto block w-full max-w-[44rem] text-balance text-center text-lg leading-8 text-[var(--marketing-text-muted)] sm:text-[1.25rem] sm:leading-9">
            {CORE_LINE}
          </p>
        </div>

        {/* z-[60] keeps the CTA block above the hero-fade-in transform stack
            (the same tier the old form block held), below the demo overlay's
            z-[100]. */}
        <div className="hero-fade-in hero-delay-3 relative z-[60] mt-9 flex w-full flex-col items-center gap-4">
          <TrialButton location="hero" size="lg" className="w-full sm:w-auto" />
          {/* The terms line ("3 days free. No card. Your whole team.") was
              removed on a founder call (2026-09-11). The demo control used to
              follow it and owned an "Or" for that reason; with no sentence in
              front of it, that connector had nothing to join, so it went in
              the same change — see WatchDemo's header. The <p> stays so the
              control keeps the terms line's size, colour and place in the
              stack, and so a terms sentence can come back without moving
              anything. */}
          <p className="text-sm leading-6 text-[var(--marketing-text-muted)]">
            <WatchDemo variant="link" />
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
