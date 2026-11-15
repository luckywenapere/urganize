import { RiCheckLine, RiCloseLine } from "react-icons/ri";
import { ScrollReveal } from "../ScrollReveal";
import { SectionShell } from "../SectionShell";
import { TrialButton } from "../TrialButton";
import { centeredHeadlineClass, wideContainerClass } from "./shared";

// The pain beat (2026-10-17, URG-334), now a side-by-side table (2026-11-12,
// #1220, from the Coframe review). The page used to name the pains here and
// the fixes three sections later, so a sceptical manager had to join them up
// in their head. Each row now puts the group chat and Urganize next to each
// other.
//
// The "group chat" lines are the house "before" lines from
// content/testimonials.ts (transformationPairs[].before), cut to one short
// thought each. Every "Urganize" line is true of every plan today: one plan per
// rollout, one owner and one date per task, the timeline, and due-date
// reminders to the task's owner (WhatsApp reminders are a Pro feature, so the
// line does not say WhatsApp).
//
// data-nosnippet: chat-chaos prose is exactly what Google once substituted for
// the page description (see StorySection's header and lib/seo.ts).
const ROWS = [
  {
    topic: "The plan",
    chat: "In a pinned chat, a spreadsheet and your head.",
    urganize: "One plan with every step and every date.",
  },
  {
    topic: "Who does what",
    chat: "Tasks get assigned in messages that get scrolled past.",
    urganize: "Every task has one owner and one date.",
  },
  {
    topic: "Where things stand",
    chat: "To know, you ask again.",
    urganize: "One timeline shows what is done, what is late and what is next.",
  },
  {
    topic: "Reminders",
    chat: "You chase people.",
    urganize: "Each person gets a reminder before their task is due.",
  },
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
            Your plan shouldn&rsquo;t live in the group chat.
          </h2>
        </div>

        <div
          data-nosnippet
          className="mx-auto mt-12 max-w-[64rem] overflow-hidden rounded-2xl border border-[color:var(--marketing-border)]"
        >
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">The group chat compared with Urganize</caption>
            {/* Column heads are visible from sm up; on a phone each row
                labels its own two lines, so the heads would only repeat. */}
            <thead className="hidden sm:table-header-group">
              <tr className="bg-[var(--marketing-surface-muted)]">
                <th scope="col" className="w-[22%] px-6 py-4">
                  <span className="sr-only">Topic</span>
                </th>
                <th scope="col" className="px-6 py-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-text-subtle)]">
                  The group chat
                </th>
                <th scope="col" className="px-6 py-4 font-mono text-xs font-bold uppercase tracking-[0.22em] text-[var(--marketing-accent)]">
                  Urganize
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr
                  key={row.topic}
                  className="block border-t border-[color:var(--marketing-border)] bg-[var(--marketing-bg)] px-6 py-5 first:border-t-0 sm:table-row sm:px-0 sm:py-0 sm:first:border-t"
                >
                  <th
                    scope="row"
                    className="block pb-3 text-sm font-semibold text-[var(--marketing-text)] sm:table-cell sm:px-6 sm:py-6 sm:align-top"
                  >
                    {row.topic}
                  </th>
                  <td className="flex items-start gap-3 pb-2 text-[0.98rem] leading-7 text-[var(--marketing-text-muted)] sm:table-cell sm:px-6 sm:py-6 sm:align-top">
                    <RiCloseLine aria-hidden className="mt-1.5 size-4 shrink-0 text-[var(--marketing-text-subtle)] sm:mr-2 sm:inline sm:align-[-2px]" />
                    <span className="sr-only">In the group chat: </span>
                    {row.chat}
                  </td>
                  <td className="flex items-start gap-3 text-[0.98rem] leading-7 text-[var(--marketing-text)] sm:table-cell sm:px-6 sm:py-6 sm:align-top">
                    <RiCheckLine aria-hidden className="mt-1.5 size-4 shrink-0 text-[var(--marketing-accent)] sm:mr-2 sm:inline sm:align-[-2px]" />
                    <span className="sr-only">In Urganize: </span>
                    {row.urganize}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 flex justify-center">
          <TrialButton location="comparison" />
        </div>
      </SectionShell>
    </ScrollReveal>
  );
}
