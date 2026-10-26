'use client';

import { ArrowRight, Loader2 } from '@/components/icons';
import { Button } from '@urganize/ui';

/**
 * The main door into the planner: what a release with no activities shows
 * instead of an empty list.
 *
 * Rendered through the workspace's activity-banner slot with
 * `bannerReplacesEmptyState`, so it IS the panel body rather than a card above
 * one. That is what makes it unmissable: there is nothing else there.
 *
 * THE QUESTIONS ARE THE ONLY DOOR (founder call, 2026-09-12). Until then the
 * primary button drafted a plan from the release row alone and a review scene
 * followed; both are gone. Answering the planning questions now BUILDS the
 * plan — every activity lands on the rollout at once, shaped to the answers —
 * and the manager edits those activities like any other. So there is nothing
 * to steer before and nothing to approve after, which is why this card has one
 * primary action in every state and no secondary "answer a few questions
 * first" link: that IS the primary.
 *
 * Three states, all read off the planner store by WorkspaceView:
 *   fresh      — nothing has happened yet.
 *   generating — the intake fired the build (up to about half a minute on the
 *                model); the card holds the room until the activities arrive.
 *   failed     — UrgAns could not read the typed notes and refused rather
 *                than guess (nothing created, the answers are kept). The only
 *                way out is the questions again, which is the retry.
 */

export type PlanReleaseCardState = 'fresh' | 'generating' | 'failed';

type PlanReleaseCardProps = {
  state: PlanReleaseCardState;
  /** The server's own sentence for a refused build, shown in the failed state. */
  failureMessage?: string | null;
  /** Open the planning questions — the primary action, and the retry. */
  onPlan: () => void;
  onAddActivity: () => void;
  /** The idea card shows Build my plan itself, so the fresh state stays hidden. */
  deferToIdeas?: boolean;
};

export function PlanReleaseCard({ state, failureMessage, onPlan, onAddActivity, deferToIdeas = false }: PlanReleaseCardProps) {
  const copy = {
    fresh: {
      headline: 'Plan this rollout.',
      body: '',
      cta: 'Build my plan',
    },
    generating: {
      headline: 'UrgAns is building your plan.',
      body: 'About half a minute. It lands here when it is done.',
      cta: null,
    },
    failed: {
      headline: 'UrgAns could not read your notes just now.',
      body: failureMessage
        ? `${failureMessage} Nothing was created. Your answers are saved.`
        : 'Nothing was created. Your answers are saved.',
      cta: 'Try again',
    },
  }[state];

  // Fresh is one line: the ask and the one button. The questions explain
  // themselves, so no eyebrow and no paragraph stand between a new rollout and
  // its plan (2026-10-26, founder call).
  if (state === 'fresh') {
    if (deferToIdeas) return null;
    // Mock A (2026-10-26): the same 61.8% column as the idea card above it, so
    // the two read as one flow. The headline stays for screen readers; the idea
    // card's question is what sighted people read first.
    return (
      <div className="mx-auto flex w-full max-w-[26rem] flex-col items-center gap-2 px-1 pb-10 pt-6 text-center sm:w-[61.8%] sm:min-w-[22rem]">
        <h3 className="sr-only">{copy.headline}</h3>
        <Button
          type="button"
          onClick={onPlan}
          // Guided-tour anchor (lib/tours.ts); inert without the flag.
          data-tour="plan-rollout"
          className="h-12 justify-center gap-2 whitespace-nowrap rounded-full px-8"
        >
          {copy.cta}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <p className="text-xs text-content-tertiary">Five questions. About a minute.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-brand/5 p-5 sm:p-6">
      {state === 'generating' ? (
        <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-brand/10 text-brand">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        </span>
      ) : null}

      <h3 className="font-display text-xl font-semibold leading-tight text-content-primary">
        {copy.headline}
      </h3>
      <p className="mt-2 max-w-prose text-sm leading-6 text-content-secondary" aria-live="polite">
        {copy.body}
      </p>

      {copy.cta ? (
        <Button type="button" onClick={onPlan} className="mt-5 h-11 w-full justify-center sm:w-auto">
          {copy.cta}
        </Button>
      ) : null}

      {state === 'failed' ? (
        <p className="mt-5 border-t border-brand/20 pt-4 text-xs leading-5 text-content-secondary">
          Prefer to build it by hand?{' '}
          <button
            type="button"
            onClick={onAddActivity}
            className="motion-focus font-medium text-content-primary underline decoration-stroke-strong underline-offset-2 transition-colors hover:decoration-brand"
          >
            Add an activity yourself
          </button>
        </p>
      ) : null}
    </div>
  );
}
