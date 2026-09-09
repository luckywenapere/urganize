'use client';

import { Loader2 } from '@/components/icons';
import { Button } from '@urganize/ui';

/**
 * The main door into the planner: what a release with no activities shows
 * instead of an empty list.
 *
 * Rendered through the workspace's activity-banner slot with
 * `bannerReplacesEmptyState`, so it IS the panel body rather than a card above
 * one. That is what makes it unmissable: there is nothing else there.
 *
 * ONE TAP IS THE PRIMARY PATH (spec 6.1, Decision B, 2026-09-03): the button
 * drafts immediately from what the release row already knows — no questions
 * asked first (buildAutoIntake derives release type, artist and date
 * server-side). The seven-question modal survives as a SECONDARY "Answer a
 * few questions first" link, for a manager who wants to steer the draft (a
 * real budget, a real goal, which tracks are ready) before UrgAns ever calls
 * a model, rather than as the only door in.
 */

type PlanReleaseCardProps = {
  /** A draft already exists, so the primary action is "review it". */
  hasDraft: boolean;
  /** UrgAns is drafting right now. */
  isGenerating: boolean;
  /** One tap: draft immediately from what the release row already knows. */
  onDraftNow: () => void;
  /** The seven-question refine path — steer the draft before it exists. */
  onRefine: () => void;
  onReview: () => void;
  onAddActivity: () => void;
};

export function PlanReleaseCard({
  hasDraft,
  isGenerating,
  onDraftNow,
  onRefine,
  onReview,
  onAddActivity,
}: PlanReleaseCardProps) {
  const state = isGenerating ? 'generating' : hasDraft ? 'draft' : 'fresh';

  const copy = {
    fresh: {
      headline: "Let's plan this release.",
      body: 'UrgAns drafts your rollout from the playbook that delivers releases, using what this release already tells us. You approve every task before anything is scheduled.',
      cta: 'Draft the plan',
    },
    draft: {
      headline: 'Your draft plan is waiting.',
      body: 'Review it, change anything and approve when it looks right.',
      cta: 'Review your draft plan',
    },
    generating: {
      headline: 'UrgAns is drafting your plan.',
      body: 'It will be ready in a moment. You can watch it come together.',
      cta: 'See the draft',
    },
  }[state];

  return (
    <div className="rounded-xl border border-brand/30 bg-brand/5 p-5 sm:p-6">
      {isGenerating ? (
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </span>
      ) : null}

      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-brand">
        UrgAns planner
      </p>
      <h3 className="mt-1 font-display text-xl font-semibold leading-tight text-content-primary">
        {copy.headline}
      </h3>
      <p className="mt-2 max-w-prose text-sm leading-6 text-content-secondary">{copy.body}</p>

      <Button
        type="button"
        onClick={state === 'fresh' ? onDraftNow : onReview}
        className="mt-5 h-11 w-full justify-center sm:w-auto"
      >
        {copy.cta}
      </Button>

      {state === 'fresh' ? (
        <p className="mt-3 text-xs leading-5 text-content-secondary">
          <button
            type="button"
            onClick={onRefine}
            className="motion-focus font-medium text-content-primary underline decoration-stroke-strong underline-offset-2 transition-colors hover:decoration-brand"
          >
            Answer a few questions first
          </button>{' '}
          to steer the draft.
        </p>
      ) : null}

      <div className="mt-5 border-t border-brand/20 pt-4">
        <p className="text-xs leading-5 text-content-secondary">
          Prefer to build it by hand?{' '}
          <button
            type="button"
            onClick={onAddActivity}
            className="motion-focus font-medium text-content-primary underline decoration-stroke-strong underline-offset-2 transition-colors hover:decoration-brand"
          >
            Add an activity yourself
          </button>{' '}
          and skip the draft.
        </p>
      </div>
    </div>
  );
}
