'use client';

import { ArrowRight, X } from '@/components/icons';

/**
 * The moment a plan lands (2026-10-26, founder approved the new-rollout mocks).
 * A plan used to arrive as a toast and a plain list. This is the result you can
 * feel: how many steps, what comes first, and the brief already written from it.
 * Shown once per build, on the rollout the plan was built for, until dismissed.
 */

export type PlanLandedStep = { id: string; title: string; when: string };

type PlanLandedCardProps = {
  count: number;
  /** What the plan was built for, in the planner's own words. */
  summary: string | null;
  steps: PlanLandedStep[];
  onReadBrief: (() => void) | null;
  onDismiss: () => void;
};

export function PlanLandedCard({ count, summary, steps, onReadBrief, onDismiss }: PlanLandedCardProps) {
  return (
    <section
      aria-label="Your plan is ready"
      className="relative mb-4 rounded-2xl border border-brand/30 bg-brand/5 p-5"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="motion-focus absolute right-3 top-3 grid h-8 w-8 place-items-center text-content-tertiary transition-colors hover:text-content-primary"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <p className="text-xs font-medium text-brand">Your plan is ready</p>
      <h2 className="mt-1 pr-8 font-display text-2xl font-semibold leading-tight text-content-primary">
        {count} {count === 1 ? 'step' : 'steps'}, in order.
      </h2>
      {summary ? <p className="mt-2 max-w-prose text-sm leading-6 text-content-secondary">{summary}</p> : null}

      {steps.length > 0 ? (
        <ol className="mt-4 divide-y divide-stroke-default rounded-xl border border-stroke-default bg-bg-surface">
          {steps.map((step, index) => (
            <li key={step.id} className="flex min-h-11 items-center gap-3 px-3.5 text-sm">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-stroke-default text-[11px] text-content-tertiary">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-content-primary">{step.title}</span>
              {step.when ? <span className="shrink-0 font-mono text-[12px] text-content-secondary">{step.when}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}

      {onReadBrief ? (
        <button
          type="button"
          onClick={onReadBrief}
          className="motion-focus motion-press mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-content-inverse transition-colors hover:bg-brand-hover"
        >
          Read the brief
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </section>
  );
}
