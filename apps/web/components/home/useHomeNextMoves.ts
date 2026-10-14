'use client';

import { useMemo } from 'react';
import type { HomePlacements, HomeReleaseSummary } from '@/lib/home/types';
import type { NextMoveRollout } from '@/lib/next-moves';
import { readTestRelease } from '@/lib/test-release';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useShellStore } from '@/stores/useShellStore';
import { useNextMoves } from '@/components/next-moves/useNextMoves';

/**
 * Home's next moves (URG-259). The rollouts are Home's in-flight ones, plus any
 * rollout the viewer owns that has nothing in it yet (a fresh one has no date
 * and no activities, so Home does not count it as in flight, and that is
 * exactly when "Build the plan" matters). Activities come from the catalog
 * store Home already filled; pitch facts from Home's placements.
 */
export function useHomeNextMoves(input: {
  releases: readonly HomeReleaseSummary[];
  viewerId: string;
  placements: HomePlacements;
}) {
  const storeReleases = useReleaseStore((state) => state.releases);
  const storeTasks = useTaskStore((state) => state.tasks);
  const selectedArtistId = useShellStore((state) => state.selectedArtistId);
  const { releases, viewerId, placements } = input;

  const rollouts = useMemo<NextMoveRollout[]>(() => {
    const tasksByRelease = new Map<string, NextMoveRollout['tasks'][number][]>();
    for (const task of storeTasks) {
      if (!task.releaseId) continue;
      const list = tasksByRelease.get(task.releaseId) ?? [];
      list.push(task);
      tasksByRelease.set(task.releaseId, list);
    }

    const pitchesByRelease = new Map<string, { count: number; lastSentDaysAgo: number | null }>();
    for (const pitch of [...placements.placed, ...placements.underReview]) {
      if (!pitch.releaseId) continue;
      const current = pitchesByRelease.get(pitch.releaseId) ?? { count: 0, lastSentDaysAgo: null };
      current.count += 1;
      current.lastSentDaysAgo =
        current.lastSentDaysAgo === null ? pitch.sentDaysAgo : Math.min(current.lastSentDaysAgo, pitch.sentDaysAgo);
      pitchesByRelease.set(pitch.releaseId, current);
    }

    const byId = new Map(storeReleases.map((release) => [release.id, release]));
    const ids = new Set(releases.map((release) => release.id));
    for (const release of storeReleases) {
      if (ids.has(release.id)) continue;
      if (release.ownerUserId !== viewerId) continue;
      if (release.status === 'archived' || release.status === 'released') continue;
      if (readTestRelease(release.metadata)) continue;
      if (selectedArtistId && release.artistId !== selectedArtistId) continue;
      if ((tasksByRelease.get(release.id) ?? []).length > 0) continue;
      ids.add(release.id);
    }

    return [...ids].map((id) => {
      const full = byId.get(id);
      const summary = releases.find((release) => release.id === id);
      return {
        id,
        title: summary?.title || full?.title || '',
        releaseDate: summary?.releaseDate ?? full?.releaseDate ?? null,
        status: full?.status ?? null,
        isOwner: full?.ownerUserId === viewerId,
        tasks: tasksByRelease.get(id) ?? [],
        pitches: pitchesByRelease.get(id) ?? { count: 0, lastSentDaysAgo: null },
      };
    });
  }, [releases, storeReleases, storeTasks, placements, viewerId, selectedArtistId]);

  return useNextMoves({ surface: 'home', rollouts });
}
