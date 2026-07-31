import {
  RELEASE_ROOM_MEMBER_COUNT,
  WHATSAPP_COMMUNITY_URL,
} from "@/lib/community";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass } from "./shared";

// Low-friction secondary conversion path (2026-07-31): The Release Room
// previously existed only as a footer link with no member count shown
// anywhere. Placed LAST, after the final email CTA, on purpose — a free,
// one-tap WhatsApp join placed earlier would cannibalize the email capture
// that is the site's actual funnel; this is the offer for someone who
// scrolled everything and still didn't leave an email.
//
// The member count sits in the MONO DATA LINE, never the headline — the
// same spec-sheet treatment this site already uses for real numbers
// ("+ 56 MORE...", "Live since January 2026" in TemplatePlanSection /
// WorkspaceShotSection). That's what makes 35 read as a fact instead of a
// boast; a number in a bold headline invites the comparison that makes a
// small number look small. See lib/community.ts for how the count is kept
// honest (manually re-verified, no "+", null-safe).
export function ReleaseRoomSection() {
  const countSegment =
    RELEASE_ROOM_MEMBER_COUNT !== null
      ? ` · ${RELEASE_ROOM_MEMBER_COUNT} MEMBERS`
      : "";

  return (
    <ScrollReveal>
      <SectionShell
        className="py-[80px] lg:py-[100px]"
        containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
      >
        <div className="mx-auto max-w-[42rem] text-center">
          <h2 className={centeredHeadlineClass}>
            Sit in the room where managers compare notes.
          </h2>

          <p className="mt-6 font-mono text-[0.72rem] tracking-[0.16em] text-[var(--marketing-text-subtle)]">
            THE RELEASE ROOM{countSegment} · WHATSAPP · FREE
          </p>

          <p className="mx-auto mt-6 max-w-[38rem] text-balance text-base leading-8 text-[var(--marketing-text-muted)]">
            A WhatsApp group for artist managers and small label teams running
            releases. It&apos;s small on purpose — no pitch, no spam, just
            people comparing notes on rollouts they&apos;re actually running.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4">
            <a
              href={WHATSAPP_COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-[60] inline-flex cursor-pointer touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] sm:text-base"
            >
              Join on WhatsApp
            </a>
            <a
              href="/community"
              className="text-sm text-[var(--marketing-text-subtle)] underline underline-offset-4 hover:text-[var(--marketing-text)]"
            >
              What is The Release Room?
            </a>
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
