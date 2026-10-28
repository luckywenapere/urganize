'use client';

import { ChartNoAxesGantt, ListChecks, Smartphone } from '@/components/icons';
import { rememberPlanView, type PlanView } from '@/lib/plan-view';
import { useSceneOverlay } from './useSceneOverlay';

const OPTIONS: { view: PlanView; label: string; Icon: typeof ListChecks }[] = [
  { view: 'activities', label: 'List', Icon: ListChecks },
  { view: 'timeline', label: 'Timeline', Icon: ChartNoAxesGantt },
];

/**
 * List or Timeline, for Work the plan (founder approved mock, Oct 28, 2026).
 * Two small icons in a thin outline, the lit one lightly shaded; the names show
 * on hover and for screen readers. It replaces the separate Timeline row in the
 * rollout menu, on the phone and the computer.
 */
export function PlanViewToggle({ releaseId, view }: { releaseId: string; view: PlanView }) {
  const { openScene } = useSceneOverlay();
  return (
    <div role="group" aria-label="Plan view" className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-stroke-default p-0.5">
      {OPTIONS.map(({ view: option, label, Icon }) => {
        const on = option === view;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={() => {
              if (on) return;
              rememberPlanView(releaseId, option);
              openScene(option, releaseId);
            }}
            className={`motion-focus grid h-8 w-9 touch-manipulation place-items-center rounded-md transition-colors lg:h-6 lg:w-7 ${
              on ? 'bg-bg-hover text-content-primary' : 'text-content-tertiary hover:text-content-primary'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** Shown in the timeline's place on a phone held upright. */
export function RotatePrompt({ onStay }: { onStay: () => void }) {
  return (
    <div data-rotate-prompt className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <Smartphone className="h-12 w-12 text-brand motion-safe:animate-pulse" aria-hidden="true" />
      <h3 className="font-display text-lg font-semibold text-content-primary">Turn your phone sideways</h3>
      <p className="max-w-[30ch] text-sm text-content-secondary">
        The timeline needs the width. Rotate to see every week at once. It opens by itself.
      </p>
      <button
        type="button"
        onClick={onStay}
        className="motion-focus motion-press rounded-full px-3 py-2 text-sm font-medium text-brand"
      >
        Stay on the list
      </button>
    </div>
  );
}
