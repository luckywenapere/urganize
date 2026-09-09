'use client';

import { useEffect, useRef } from 'react';

import { useAuthStore } from '@/lib/auth-store';
import { isBodyScrollLocked } from '@/lib/body-scroll-lock';
import {
  CATALOG_TOUR_STEPS,
  decideCatalogTourAutoStart,
  markTourSeen,
  readTourSeen,
  resolveCatalogTourCta,
  type TourStep,
} from '@/lib/tours';
import { useChappiStore } from '@/stores/useChappiStore';
import { useTourStore } from '@/stores/useTourStore';

/**
 * Starts the catalog tour, once per user, on the first visit to the catalog.
 *
 * MOUNTED IN WorkspaceView, NOT AppShell, and that placement is the decision:
 * this hook needs the scoped rollout, its activity count and the release list
 * to build the contextual last step, and WorkspaceView is where those live.
 * It also means "on the catalog" is true by construction rather than by
 * matching a pathname — which matters because #568 made UrgAns the post-auth
 * landing, so a first-run user does not arrive here at all until they tap.
 *
 * It also consumes a `pendingReplay` parked by the HelpMenu or by Settings,
 * which is how a replay asked for from another page gets honoured on arrival.
 * A replay ignores seen-state, which is the whole point of asking for one.
 */
export function useCatalogTourAutoStart({
  enabled,
  plannerEnabled,
  releasesLoaded,
  releaseCount,
  scopedReleaseId,
  scopedTaskCount,
  canCreate,
}: {
  enabled: boolean;
  plannerEnabled: boolean;
  releasesLoaded: boolean;
  releaseCount: number;
  scopedReleaseId: string | null;
  scopedTaskCount: number;
  canCreate: boolean;
}): void {
  const start = useTourStore((state) => state.start);
  const consumeReplay = useTourStore((state) => state.consumeReplay);
  const pendingReplay = useTourStore((state) => state.pendingReplay);

  const userId = useAuthStore((state) => state.user?.id ?? '');
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const isCurator = useAuthStore((state) => state.user?.role === 'curator');

  // Every input is a dependency rather than a latest-ref, deliberately: a ref
  // assigned during render is a `react-hooks/refs` error in this config, and
  // the effect is cheap to re-run — `attempted` short-circuits it after the
  // first go, and `consumeReplay` is a no-op with nothing parked. So the
  // decision always reads current values with no ref to keep in step.
  const attempted = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;

    const replay = consumeReplay('catalog');
    if (!replay) {
      if (attempted.current) return;
      const ready = decideCatalogTourAutoStart({
        flag: enabled,
        seen: readTourSeen(userId, 'catalog'),
        authResolved: !isAuthLoading && Boolean(userId),
        isCurator,
        onCatalog: true,
        releasesLoaded,
        bodyLocked: isBodyScrollLocked(),
        chappiMessageCount: useChappiStore.getState().messages.length,
      });
      if (!ready) return;
    }
    attempted.current = true;

    const cta = resolveCatalogTourCta({
      plannerEnabled,
      scopedReleaseId,
      scopedTaskCount,
      releaseCount,
      canCreate,
    });

    const steps: TourStep[] = [
      ...CATALOG_TOUR_STEPS.slice(0, -1),
      {
        id: 'finish',
        anchor: cta.anchor,
        title: cta.title,
        body: cta.body,
        ctaLabel: cta.ctaLabel,
      },
    ];

    // Marked at START, not at finish: a tour the user walks away from mid-way
    // has still been offered, and re-offering it on the next navigation is the
    // interruption this whole feature is written to avoid. Replay is how
    // somebody asks for it again.
    markTourSeen(userId, 'catalog');
    start('catalog', steps);
  }, [
    enabled,
    plannerEnabled,
    releasesLoaded,
    releaseCount,
    scopedReleaseId,
    scopedTaskCount,
    canCreate,
    pendingReplay,
    userId,
    isAuthLoading,
    isCurator,
    consumeReplay,
    start,
  ]);
}
