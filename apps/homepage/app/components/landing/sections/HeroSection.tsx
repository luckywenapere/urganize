import { ProofLine } from "../ProofLine";
import { SectionShell } from "../SectionShell";
import { WaitlistForm } from "../WaitlistForm";
import { WatchDemo } from "../WatchDemo";
import { wideContainerClass } from "./shared";

export function HeroSection() {
  return (
    <SectionShell
      className="pb-20 pt-20 sm:pb-24 sm:pt-24 lg:pb-28 lg:pt-28"
      containerClassName={wideContainerClass}
    >
      <div className="mx-auto flex max-w-[64rem] flex-col items-center text-center">
        {/* Eyebrow removed (2026-08-25, founder call): the h1 now leads the
            viewport directly, so the section's own top padding carries the
            framing that the eyebrow + its mt-8 used to (bumped one step at
            every breakpoint to keep the same visual weight under the fixed
            header). */}
        <div className="flex flex-col items-center gap-8 sm:gap-10">
          {/* Outcome-first h1: the old "One home for every release" was a
              container metaphor, banned under the 2026-08 positioning.
              The accent stays on "every release" — the unit of work. */}
          <h1 className="hero-fade-in hero-delay-1 mx-auto max-w-[16ch] text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.4rem] lg:text-[5.6rem]">
            Run{" "}
            <span className="italic text-[var(--marketing-accent)]">
              every release
            </span>{" "}
            to plan.
          </h1>

          <p className="hero-fade-in hero-delay-2 mx-auto block w-full max-w-[44rem] text-balance text-center text-lg leading-8 text-[var(--marketing-text-muted)] sm:text-[1.25rem] sm:leading-9">
            Urganize plans the rollout, gives every activity an owner and
            shows you where each release stands.
          </p>
        </div>

        {/* id="waitlist" is the anchor target for the header's
            "Join the waitlist" CTA (every marketing page links to
            /#waitlist); scroll-mt offsets the fixed header. */}
        <div
          id="waitlist"
          className="hero-fade-in hero-delay-3 relative z-[60] mt-8 flex w-full scroll-mt-28 flex-col items-center gap-3"
        >
          <WaitlistForm source="homepage_hero" />
          {/* Proof directly under the primary CTA (2026-07-31): the form
              previously had zero credibility signal next to it despite four
              signed-off testimonials existing on this page, two-thirds down
              where the decision was already made. zaddyfunds' quote is both
              the shortest (one visual line at this width) and the only
              publicly link-verifiable one — the highest credibility per
              pixel available. Placed BELOW the form so the form's own
              y-position is unchanged (zero fold/CLS risk to the primary
              CTA); the hairline separates it from the form's own
              "JOIN THE WAITLIST" mono caption directly above so the two
              small muted lines don't visually collide. */}
          <ProofLine
            id="zaddyfunds"
            className="mt-2 w-full max-w-[30rem] border-t border-[color:var(--marketing-border)] pt-5"
          />
        </div>

        {/* The demo hides behind this button now (founder call, 2026-08-27):
            the old full-width 16:9 facade took ~500px that visitors scrolled
            straight past. WatchDemo opens the player in an overlay, so only
            the people who actually want the demo see it. Fades in with the
            CTA group (delay-3) rather than on scroll — it sits above the
            fold with the form. */}
        <div className="hero-fade-in hero-delay-3 mt-10">
          <WatchDemo />
        </div>
      </div>
    </SectionShell>
  );
}
