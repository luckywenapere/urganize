'use client';

import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@urganize/ui';

/**
 * The main door into the planner: what a release with no activities shows
 * instead of an empty list.
 *
 * Rendered through the workspace's activity-banner slot with
 * `bannerReplacesEmptyState`, so it IS the panel body rather than a card above
 * one. That is what makes it unmissable: there is nothing else there.
 */

type PlanReleaseCardProps = {
  /** A draft already exists, so the primary action is "review it". */
  hasDraft: boolean;
  /** UrgAns is drafting right now. */
  isGenerating: boolean;
  onPlan: () => void;
  onReview: () => void;
  onAddActivity: () => void;
};

export function PlanReleaseCard({
  hasDraft,
  isGenerating,
  onPlan,
  onReview,
  onAddActivity,
}: PlanReleaseCardProps) {
  const state = isGenerating ? 'generating' : hasDraft ? 'draft' : 'fresh';

  const copy = {
    fresh: {
      headline: "Let's plan this release.",
      body: 'Answer a few questions and UrgAns drafts your rollout from the playbook that ships releases. You approve every task before anything is scheduled.',
      cta: 'Plan this release with UrgAns',
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
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
        {isGenerating ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        )}
      </span>

      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.16em] text-brand">
        UrgAns planner
      </p>
      <h3 className="mt-1 font-display text-xl font-semibold leading-tight text-content-primary">
        {copy.headline}
      </h3>
      <p className="mt-2 max-w-prose text-sm leading-6 text-content-secondary">{copy.body}</p>

      <Button
        type="button"
        onClick={state === 'fresh' ? onPlan : onReview}
        className="mt-5 h-11 w-full justify-center sm:w-auto"
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {copy.cta}
      </Button>

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
