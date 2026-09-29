'use client';

import { useMemo, useState } from 'react';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useLiveHomeSections } from './useLiveHomeSections';
import { HomeHeaderRow } from './HomeHeaderRow';
import { ArtistFilterChips } from './ArtistFilterChips';
import { BriefCard } from './BriefCard';
import { YourTasksSection } from './YourTasksSection';
import { WaitingOnOthersSection } from './WaitingOnOthersSection';
import { ReleasesSection } from './ReleasesSection';
import { PlacementsSection } from './PlacementsSection';
import { NextShowSection } from './NextShowSection';
import type { HomePayload } from '@/lib/home/types';

/**
 * The Manager / Mid-release layout — the only fully-built state in step 2.
 * Every other role/state combination renders HomeNotBuiltYet instead (see
 * app/dashboard/home/HomePageClient.tsx).
 *
 * The artist filter narrows Your tasks / Waiting / Releases / Placements to
 * one artist's releases; Next show is deliberately left UNFILTERED — it is
 * a single "what's coming up" card for the whole roster, and there is no
 * artistId on it to filter against without a fragile name match.
 */
export function ManagerMidReleaseView({ home, viewerId }: { home: HomePayload; viewerId: string }) {
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);

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

  return (
    <div className="home-scene-container space-y-5">
      <HomeHeaderRow header={home.header} />
      <ArtistFilterChips artists={live.artists} selectedArtistId={selectedArtistId} onSelect={setSelectedArtistId} />
      <BriefCard />
      <div className="home-two-col">
        <div className="space-y-5">
          <YourTasksSection yourTasks={yourTasks} />
          <WaitingOnOthersSection tasks={waitingTasks} djLinks={home.waiting.djLinks} onTimeCount={live.waitingOnTimeCount} />
        </div>
        <div className="space-y-5">
          <ReleasesSection releases={releases} />
          <PlacementsSection placements={placements} />
          <NextShowSection nextShow={home.nextShow} />
        </div>
      </div>
    </div>
  );
}
