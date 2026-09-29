import { Chappi } from '@urganize/ui';
import type { ChappiSpeaksLine } from '@/lib/home/chappi-speaks';

/**
 * "Chappi Speaks": the slim card at the top of a quiet Home. Same frame as
 * every other Home section (rounded-xl, stroke-default, bg-surface), with
 * Chappi on the left and one line of encouragement beside him.
 *
 * Not dismissible, on purpose: it only exists when nothing is asking for the
 * user's attention, so there is nothing to get out of the way of. He rests on
 * an ordinary day and celebrates when the user's own release is out today.
 */
export function ChappiSpeaksCard({ line }: { line: ChappiSpeaksLine }) {
  return (
    <section
      aria-label="Chappi speaks"
      className="flex items-center gap-4 rounded-xl border border-stroke-default bg-bg-surface p-4 sm:gap-5 sm:p-5"
    >
      <Chappi pose={line.occasion === 'release_today' ? 'celebrating' : 'resting'} size={72} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Chappi speaks
        </p>
        <p className="mt-1.5 font-display text-lg font-semibold leading-snug text-content-primary sm:text-xl">
          {line.text}
        </p>
      </div>
    </section>
  );
}
