'use client';

import { useEffect, useState } from 'react';
import { Button } from '@urganize/ui';
import { useAuthStore } from '@/lib/auth-store';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import {
  ROLLOUT_OFFER_COPY as COPY,
  decideHomeRolloutCard,
  isRolloutOfferEnabled,
  readHomeOfferDismissed,
  writeHomeOfferDismissed,
} from '@/lib/rollout-offer';
import { useFirstReleaseRequired } from '@/components/releases/useFirstReleaseRequired';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useShellStore } from '@/stores/useShellStore';

const ENABLED = isRolloutOfferEnabled();

function local(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * "Got a release coming?" (2026-10-24, lighter rollouts): one quiet card on
 * Home for a team with no rollouts, in place of the old app-wide lock. Plan a
 * rollout opens the plan choice; Not now hides it for this user on this device.
 * Rules in lib/rollout-offer.ts.
 */
export function RolloutOfferCard() {
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const isCurator = useAuthStore((state) => state.user?.role === 'curator');
  const noRollouts = useFirstReleaseRequired();
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);
  const openPlanChoice = useShellStore((state) => state.openPlanChoice);
  // Read after mount: storage during render is a hydration mismatch.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(readHomeOfferDismissed(userId, local()));
  }, [userId]);

  // Home reads its own store; the zero-rollout check reads the release store.
  useEffect(() => {
    if (ENABLED) void loadCommandCenter();
  }, [loadCommandCenter]);

  const show = decideHomeRolloutCard({ enabled: ENABLED, noRollouts, isCurator, dismissed });
  if (!show) return null;

  return (
    <section
      aria-labelledby="rollout-offer-title"
      className="mt-5 rounded-[20px] border border-stroke-default bg-bg-surface px-5 py-4"
    >
      <h2 id="rollout-offer-title" className="text-base font-semibold text-content-primary">
        {COPY.homeTitle}
      </h2>
      <p className="mt-0.5 text-sm text-content-secondary">{COPY.homeBody}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          size="md"
          className="min-h-11"
          onClick={() => {
            captureAnalyticsEvent({ name: 'rollout_offer_plan', properties: { from: 'home' } });
            openPlanChoice();
          }}
        >
          {COPY.planCta}
        </Button>
        <button
          type="button"
          onClick={() => {
            captureAnalyticsEvent({ name: 'rollout_offer_dismissed', properties: { from: 'home' } });
            writeHomeOfferDismissed(userId, local());
            setDismissed(true);
          }}
          className="motion-focus min-h-11 rounded-full px-4 text-sm font-medium text-content-secondary hover:text-content-primary"
        >
          {COPY.notNow}
        </button>
      </div>
    </section>
  );
}
