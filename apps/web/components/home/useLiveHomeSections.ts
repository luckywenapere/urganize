'use client';

import { useMemo } from 'react';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { isReleaseInFlight } from '@/lib/home/state';
import { buildArtistChips } from '@/lib/home/artists';
import { buildYourTasks, buildWaitingOnOthers } from '@/lib/home/tasks';
import { buildReleaseSummary } from '@/lib/home/releases';
import type { HomeArtistChip, HomeReleaseSummary, HomeWaitingTask, HomeYourTasks } from '@/lib/home/types';
import { isTaskClosed } from '@/types/tasks';

/**
 * Recomputes the LIVE parts of Home — the parts a task tick changes on the
 * spot — from the already-loaded release/task stores, using the exact same
 * pure functions the server used to build the initial payload. This is what
 * makes ticking a checkbox on Home update the screen on the same frame,
 * without a second /api/home round trip (the approved plan's step 2 point 4:
 * "task sections are worked out in the browser").
 *
 * Everything else in HomePayload (role, state, header, placements)
 * is deliberately NOT recomputed here — role/state are frozen for the visit
 * by design (see lib/home-server.ts), and placements have no
 * client-side mutation path to react to.
 *
 * Roster artists are NOT available client-side (only in-flight releases you
 * run are), so the chip list here can only ever ADD artists relative to the
 * server's initial set, never remove one whose last release just left the
 * in-flight window — an acceptable staleness for a value that only changes
 * as time passes, not from anything the user does on this screen.
 */
export function useLiveHomeSections(
  viewerId: string,
  primaryOwnerId: string,
  initialArtists: readonly HomeArtistChip[]
): {
  artists: HomeArtistChip[];
  yourTasks: HomeYourTasks;
  waitingTasks: HomeWaitingTask[];
  waitingOnTimeCount: number;
  releases: HomeReleaseSummary[];
} {
  const releases = useReleaseStore((state) => state.releases);
  const tasks = useTaskStore((state) => state.tasks);
  const pendingCompletionIds = useTaskStore((state) => state.pendingCompletionIds);

  return useMemo(() => {
    const now = new Date();

    const releaseLookup = new Map(releases.map((release) => [release.id, { title: release.title, artistName: release.artistName }]));

    const tasksByRelease = new Map<string, typeof tasks>();
    for (const task of tasks) {
      if (!task.releaseId) continue;
      const list = tasksByRelease.get(task.releaseId) ?? [];
      list.push(task);
      tasksByRelease.set(task.releaseId, list);
    }

    const releasesYouRun = releases.filter((release) => release.ownerUserId === primaryOwnerId);
    const releaseIdsYouRun = new Set(releasesYouRun.map((release) => release.id));

    const hasOpenTasks = (releaseId: string) =>
      (tasksByRelease.get(releaseId) ?? []).some((task) => !isTaskClosed(task.status));

    const inFlightReleasesYouRun = releasesYouRun.filter((release) =>
      isReleaseInFlight(release, hasOpenTasks(release.id), now)
    );

    const artists = buildArtistChips(
      inFlightReleasesYouRun.map((release) => ({ artistId: release.artistId, artistName: release.artistName })),
      initialArtists
    );

    const yourTasks = buildYourTasks(tasks, viewerId, releaseLookup, now, pendingCompletionIds);
    const waiting = buildWaitingOnOthers(tasks, viewerId, releaseIdsYouRun, releaseLookup, now);

    const releaseSummaries = inFlightReleasesYouRun.map((release) =>
      buildReleaseSummary(release, tasksByRelease.get(release.id) ?? [], viewerId, now)
    );

    return {
      artists,
      yourTasks,
      waitingTasks: waiting.tasks,
      waitingOnTimeCount: waiting.onTimeCount,
      releases: releaseSummaries,
    };
    // initialArtists (home.artists from useHomeStore) is a stable reference
    // between renders — it only changes when a fresh /api/home load lands —
    // so listing it here recomputes exactly when the server's roster snapshot
    // genuinely changes, and never on an unrelated re-render.
  }, [releases, tasks, pendingCompletionIds, viewerId, primaryOwnerId, initialArtists]);
}
