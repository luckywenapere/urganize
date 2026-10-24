'use client';

import type { ReactNode } from 'react';
import { Button } from '@urganize/ui';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { ROLLOUT_OFFER_COPY } from '@/lib/rollout-offer';
import { useShellStore } from '@/stores/useShellStore';

/**
 * The empty state of a page that only works on a rollout (Distribute,
 * Pitching), in place of the old app-wide lock (2026-10-24). Its "Plan a
 * rollout" opens the plan choice, shows whether or not Home's card was
 * dismissed, and the rollout it makes is tagged origin 'hint'.
 */
export function NeedsRolloutEmpty({
  icon,
  title,
  body,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
}) {
  const openPlanChoice = useShellStore((state) => state.openPlanChoice);
  return (
    <div className="rounded-2xl border border-dashed border-stroke-default p-8 text-center">
      {icon ? <div className="flex justify-center text-content-tertiary">{icon}</div> : null}
      <p className="mt-3 text-sm font-semibold text-content-primary">{title}</p>
      <p className="mt-1 text-sm text-content-secondary">{body}</p>
      <Button
        size="md"
        className="mt-4 min-h-11"
        onClick={() => {
          captureAnalyticsEvent({ name: 'rollout_offer_plan', properties: { from: 'empty_state' } });
          openPlanChoice();
        }}
      >
        {ROLLOUT_OFFER_COPY.planCta}
      </Button>
    </div>
  );
}
