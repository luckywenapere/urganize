import type { ChappiSpeaksLine } from '@/lib/home/chappi-speaks';

/**
 * "Chappi Speaks": the slim card at the top of a quiet Home. Same frame as
 * every other Home section (rounded-xl, stroke-default, bg-surface), with
 * one line of encouragement.
 *
 * Not dismissible, on purpose: it only exists when nothing is asking for the
 * user's attention, so there is nothing to get out of the way of.
 */
export function ChappiSpeaksCard({ line }: { line: ChappiSpeaksLine }) {
  return (
    <section
      aria-label="For today"
      className="rounded-2xl border border-stroke-default bg-bg-surface p-4"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          For today
        </p>
        <p className="mt-1.5 font-display text-base font-semibold leading-snug text-content-primary sm:text-lg">
          {line.text}
        </p>
      </div>
    </section>
  );
}
