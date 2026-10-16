'use client';

import { useEffect, useMemo } from 'react';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { isReleaseActive } from '@/lib/release-activity';
import { pickBetweenReleases, type BetweenReleasesState } from '@/lib/release-review';

/**
 * What Home's between-releases state needs (URG-253 + URG-280), read from the
 * command-center data Home already loads: no extra request.
 *
 *  - reviewDue: the newest rollout whose post-release review is open and not
 *    dismissed (ReleaseReviewCard).
 *  - inPreProduction: the newest rollout still in pre-production.
 *  - between: no rollout has open work ahead of its release, which is when
 *    PreProductionStartCard ("Start the next one") belongs on Home.
 *
 * Layout is the Home redesign's call; this hook and the two cards are what it
 * drops in, above the existing OpportunitiesCard (URG-266).
 */
export function useBetweenReleases(): BetweenReleasesState {
  const releases = useReleaseStore((state) => state.releases);
  const tasks = useTaskStore((state) => state.tasks);
  // Home reads its own payload; make sure the rollouts are loaded too. The
  // store coalesces this with any load already in flight.
  useEffect(() => {
    void useReleaseStore.getState().loadCommandCenter();
  }, []);
  return useMemo(
    () =>
      pickBetweenReleases(
        releases.map((release) => ({
          id: release.id,
          title: release.title,
          artistName: release.artistName,
          releaseDate: release.releaseDate,
          metadata: release.metadata,
          archivedAt: isReleaseActive(release.status) ? null : 'archived',
        })),
        tasks.map((task) => ({
          id: task.id,
          releaseId: task.releaseId,
          title: task.title,
          status: task.status,
          dueDate: task.dueDate,
          completedAt: task.completedAt,
          planKey: task.planKey ?? null,
          phase: task.phase ?? null,
        }))
      ),
    [releases, tasks]
  );
}
