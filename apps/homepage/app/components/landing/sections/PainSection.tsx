import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass, wideContainerClass } from "./shared";

// The pain beat (2026-10-17, URG-334). The page used to go straight from the
// hero to the steps, so the steps answered a question nobody had asked yet.
// These three lines are the house "before" lines from content/testimonials.ts
// (transformationPairs[].before), cut to one short thought each. Keep them in
// step with that file's meaning; they describe the manager's week today.
// data-nosnippet: chat-chaos prose is exactly what Google once substituted for
// the page description (see StorySection's header and lib/seo.ts).
const PAINS = [
  "The plan is in a pinned chat, a spreadsheet and your head.",
  "Tasks get assigned in messages that get scrolled past.",
  "To know where things stand, you ask again.",
] as const;

export function PainSection() {
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[72px] lg:py-[96px]"
        containerClassName={wideContainerClass}
      >
        <div className="mx-auto max-w-[44rem] text-center">
          <h2 className={centeredHeadlineClass}>
            Releases shouldn&rsquo;t live in the group chat.
          </h2>
        </div>
        <ul data-nosnippet className="mx-auto mt-12 grid max-w-[64rem] gap-px overflow-hidden rounded-2xl border border-[color:var(--marketing-border)] bg-[var(--marketing-border)] sm:grid-cols-3">
          {PAINS.map((line) => (
            <li
              key={line}
              className="flex items-start gap-4 bg-[var(--marketing-bg)] px-6 py-6 text-left sm:py-7"
            >
              <span
                aria-hidden
                className="font-mono text-[1rem] leading-7 text-[var(--marketing-text-subtle)]"
              >
                ×
              </span>
              <p className="text-[1.02rem] leading-7 text-[var(--marketing-text-muted)]">
                {line}
              </p>
            </li>
          ))}
        </ul>
      </SectionShell>
    </ScrollReveal>
  );
}
