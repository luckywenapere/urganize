import { ProofLine } from "../ProofLine";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { WaitlistForm } from "../WaitlistForm";
import { YouTubeFacade } from "../YouTubeFacade";
import { wideContainerClass } from "./shared";

export function HeroSection() {
  return (
    <SectionShell
      className="pb-20 pt-16 sm:pb-24 sm:pt-20 lg:pb-28 lg:pt-24"
      containerClassName={wideContainerClass}
    >
      <div className="mx-auto flex max-w-[64rem] flex-col items-center text-center">
        <p className="hero-fade-in mono-label text-[var(--marketing-text-subtle)]">
          For labels and artist managers
        </p>

        <div className="mt-8 flex flex-col items-center gap-8 sm:gap-10">
          <h1 className="hero-fade-in hero-delay-1 mx-auto max-w-[22ch] text-balance text-[2.8rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[var(--marketing-text)] sm:text-[4.4rem] lg:text-[5.6rem]">
            Stop running your artists&apos; releases out of{" "}
            <span className="italic text-[var(--marketing-accent)]">
              WhatsApp threads
            </span>{" "}
            and{" "}
            <span className="italic text-[var(--marketing-accent)]">
              scattered notes
            </span>
            .
          </h1>

          <p className="hero-fade-in hero-delay-2 mx-auto block w-full max-w-[44rem] text-balance text-center text-lg leading-8 text-[var(--marketing-text-muted)] sm:text-[1.25rem] sm:leading-9">
            One home for the whole release: a hand-crafted rollout plan,
            tasks your freelance team actually owns, and a press kit ready to
            send.
          </p>
        </div>

        <div className="hero-fade-in hero-delay-3 relative z-[60] mt-8 flex w-full flex-col items-center gap-3">
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
      </div>

      <ScrollReveal>
        <div className="mx-auto mt-14 w-full max-w-4xl sm:mt-16">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl">
            <YouTubeFacade />
          </div>
        </div>
      </ScrollReveal>
    </SectionShell>
  );
}
