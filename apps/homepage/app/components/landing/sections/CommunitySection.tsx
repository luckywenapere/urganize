import { WHATSAPP_COMMUNITY_URL } from "@/lib/community";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass } from "./shared";

// Low-friction secondary conversion path (2026-07-31, renamed the same day
// from ReleaseRoomSection when the community itself was retitled from "The
// Release Room" to a general group chat — that framing is converting
// better). Placed LAST, after the final email CTA, on purpose — a one-tap
// join placed earlier would cannibalize the email capture that is the
// site's actual funnel; this is the offer for someone who scrolled
// everything and still didn't leave an email.
//
// No member count, no "FREE" stamp, no WhatsApp-forward framing (founder
// call, 2026-07-31): the platform is discovered on tap, not led with, and
// the count is dropped rather than kept stale. Body copy avoids em dashes,
// per house style.
export function CommunitySection() {
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

          <p className="mx-auto mt-6 max-w-[38rem] text-balance text-base leading-8 text-[var(--marketing-text-muted)]">
            A group chat for artist managers and small label teams running
            releases. No pitch and no spam, just people comparing notes on
            rollouts they are actually running.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4">
            <a
              href={WHATSAPP_COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-[60] inline-flex cursor-pointer touch-manipulation items-center justify-center rounded-full bg-[var(--marketing-primary)] px-7 py-3.5 text-sm font-medium tracking-[-0.02em] text-[var(--marketing-primary-text)] shadow-[0_20px_45px_var(--marketing-shadow-strong)] pointer-events-auto hover:bg-[var(--marketing-primary-hover)] sm:text-base"
            >
              Join the community
            </a>
            <a
              href="/community"
              className="text-sm text-[var(--marketing-text-subtle)] underline underline-offset-4 hover:text-[var(--marketing-text)]"
            >
              About the community
            </a>
          </div>
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
