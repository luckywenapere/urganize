'use client';

import { useMemo } from 'react';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useShellStore } from '@/stores/useShellStore';
import { useLiveHomeSections } from './useLiveHomeSections';
import type { HomePayload } from '@/lib/home/types';

/**
 * Home's live task sections, narrowed to the artist chosen in the top bar. One
 * place for the filter so Home and the chat page's side panel always agree on
 * which task is "the one to do first" and what the counts are.
 *
 * Next show is deliberately NOT filtered: it is one "what's coming up" card for
 * the whole roster, and there is no artistId on it to filter against without a
 * fragile name match.
 */
export function useHomeFocusData(home: HomePayload, viewerId: string) {
  const selectedArtistId = useShellStore((state) => state.selectedArtistId);
  const live = useLiveHomeSections(viewerId, home.primaryOwnerId, home.artists);

  const allReleases = useReleaseStore((state) => state.releases);
  const releaseArtistById = useMemo(() => {
    const map = new Map<string, string>();
    for (const release of allReleases) map.set(release.id, release.artistId);
    return map;
  }, [allReleases]);

  const matchesArtist = (releaseId: string | null): boolean => {
    if (!selectedArtistId) return true;
    if (!releaseId) return false;
    return releaseArtistById.get(releaseId) === selectedArtistId;
  };

  const releases = selectedArtistId
    ? live.releases.filter((release) => release.artistId === selectedArtistId)
    : live.releases;
  const yourTasks = selectedArtistId
    ? {
        late: live.yourTasks.late.filter((task) => matchesArtist(task.releaseId)),
        today: live.yourTasks.today.filter((task) => matchesArtist(task.releaseId)),
        week: live.yourTasks.week.filter((task) => matchesArtist(task.releaseId)),
      }
    : live.yourTasks;
  const waitingTasks = selectedArtistId
    ? live.waitingTasks.filter((task) => matchesArtist(task.releaseId))
    : live.waitingTasks;
  const placements = selectedArtistId
    ? {
        placed: home.placements.placed.filter((pitch) => matchesArtist(pitch.releaseId)),
        underReview: home.placements.underReview.filter((pitch) => matchesArtist(pitch.releaseId)),
      }
    : home.placements;

  return { live, releases, yourTasks, waitingTasks, placements };
}
