'use client';

import { Sparkles, X } from '@/components/icons';
import { ROLLOUT_TOUR_STEPS, type TourLoopId } from '@/lib/tours';
import { TourPoster } from './TourStepLoop';

/** What each still in the card stands for (#971). */
const THUMB_LABEL: Record<TourLoopId, string> = {
  activities: 'Tick work off',
  menu: 'Find everything',
  team: 'Bring your team',
};

/**
 * Tour B is OFFERED, never auto-run (founder call).
 *
 * Approving a plan is the moment the founder means by "they created one" — the
 * row already existed, the plan is what makes it a rollout — so it is when a
 * walk-through of the rollout view is worth having. But it is also the moment
 * somebody has just deliberately finished something, and hijacking the screen
 * for a tour they did not ask for is the wrong reward. Hence a card in the
 * banner slot with the same shape as NewReleaseGuide, which it replaces while
 * the flag is on.
 */
export function TourOfferCard({
  onStart,
  onDismiss,
}: {
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="mb-6 flex items-start gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4"
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-content-primary">Your rollout is planned</p>
        <p className="mt-1 text-sm leading-6 text-content-secondary">
          Want a quick look around? Three short clips.
        </p>
        {/* The three steps as stills (#971), so the card says what the tour
            covers before anyone taps. Posters only: no loop plays here. */}
        <ul className="mt-3 grid grid-cols-3 gap-1.5 sm:gap-2.5">
          {ROLLOUT_TOUR_STEPS.map((step) => (
            <li key={step.id} className="min-w-0">
              <div aria-hidden="true" className="overflow-hidden rounded-lg">
                <TourPoster loop={step.loop} thumb />
              </div>
              <span className="mt-1.5 block text-xs text-content-secondary">{THUMB_LABEL[step.loop]}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onStart}
          className="mt-3 rounded-lg border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-content-primary transition hover:bg-brand/20"
        >
          Take the tour
        </button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 rounded-lg p-1 text-content-tertiary transition hover:text-content-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
