import { changelog } from "@/content/changelog";
import { FAQ_ITEMS } from "@/content/faq";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { centeredHeadlineClass } from "./shared";

// The objections, answered on the page (2026-09-02). Native <details> with a
// shared `name`, so the browser gives us an exclusive accordion with no
// JavaScript — a visitor whose JS never arrives can still read every answer.
// `data-faq` is the hook LandingAnalytics reports `faq_open` from. The same
// FAQ_ITEMS array feeds the FAQPage JSON-LD in app/page.tsx, so the
// structured data can never claim something the page does not.
//
// The trust line under it is computed at build time from the changelog
// package: it can never be stale, because the only thing that changes it (a
// changelog edit) is itself a homepage rebuild trigger. Hidden below four —
// "1 update shipped" persuades the wrong way. Dates in the ledger are display
// strings; the two range-shaped ones do not parse and are skipped.
const DAY_MS = 24 * 60 * 60 * 1000;

function updatesShippedInLast30Days(): number {
  const cutoff = Date.now() - 30 * DAY_MS;
  return changelog.filter((release) => {
    const shipped = new Date(release.date).getTime();
    return Number.isFinite(shipped) && shipped >= cutoff;
  }).length;
}

export function FaqSection() {
  const recentUpdates = updatesShippedInLast30Days();
  return (
    <ScrollReveal>
      <SectionShell
        className="py-[80px] lg:py-[100px]"
        containerClassName="max-w-[56rem] px-6 sm:px-8 lg:px-10"
      >
        <div className="text-center">
          <h2 className={centeredHeadlineClass}>Before you start</h2>
        </div>

        <div className="mt-10 border-t border-[color:var(--marketing-border)]">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.question}
              data-faq
              name="homepage-faq"
              className="group border-b border-[color:var(--marketing-border)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left text-[1.05rem] font-medium leading-7 text-[var(--marketing-text)] [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden
                  className="shrink-0 font-mono text-[var(--marketing-text-subtle)] transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-6 text-base leading-8 text-[var(--marketing-text-muted)]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>

        {recentUpdates >= 4 ? (
          <p className="mt-10 text-center text-sm leading-6 text-[var(--marketing-text-muted)]">
            Built in the open:{" "}
            <a
              href="/changelog"
              className="text-[var(--marketing-text)] underline decoration-[color:var(--marketing-text-subtle)] underline-offset-4 transition-colors hover:decoration-[color:var(--marketing-text)]"
            >
              {recentUpdates} updates shipped in the last 30 days
            </a>
            .
          </p>
        ) : null}
      </SectionShell>
    </ScrollReveal>
  );
}
