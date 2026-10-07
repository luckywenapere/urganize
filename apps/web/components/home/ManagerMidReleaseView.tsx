"use client";

import { useMemo, useState } from "react";
import { useReleaseStore } from "@/stores/useReleaseStore";
import { useLiveHomeSections } from "./useLiveHomeSections";
import { HomeHeaderRow } from "./HomeHeaderRow";
import { HomeAskBar } from "./HomeAskBar";
import { FocusTaskCard } from "./FocusTaskCard";
import { UpNextCard } from "./UpNextCard";
import { pickUpNext } from "@/lib/home/up-next";
import { pickFocusTask, withoutTask } from "@/lib/home/focus";
import { AttentionCards } from "./AttentionCards";
import { OnboardingBar } from "./OnboardingBar";
import { buildOnboardingProgress } from "@/lib/home/onboarding";
import { buildAttentionItems } from "@/lib/home/attention";
import { useShellStore } from "@/stores/useShellStore";
import { BriefCard } from "./BriefCard";
import { ChappiSpeaksCard } from "./ChappiSpeaksCard";
import { pickChappiSpeaks } from "@/lib/home/chappi-speaks";
import { ChevronDown } from "@/components/icons";
import { YourTasksSection } from "./YourTasksSection";
import { WaitingOnOthersSection } from "./WaitingOnOthersSection";
import { ReleasesSection } from "./ReleasesSection";
import { PlacementsSection } from "./PlacementsSection";
import { NextShowSection } from "./NextShowSection";
import type { HomePayload } from "@/lib/home/types";

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
export function ManagerMidReleaseView({
  home,
  viewerId,
}: {
  home: HomePayload;
  viewerId: string;
}) {
  // The artist comes from the top bar's switcher, so Home and Catalogue agree.
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
        late: live.yourTasks.late.filter((task) =>
          matchesArtist(task.releaseId),
        ),
        today: live.yourTasks.today.filter((task) =>
          matchesArtist(task.releaseId),
        ),
        week: live.yourTasks.week.filter((task) =>
          matchesArtist(task.releaseId),
        ),
      }
    : live.yourTasks;
  const waitingTasks = selectedArtistId
    ? live.waitingTasks.filter((task) => matchesArtist(task.releaseId))
    : live.waitingTasks;
  const placements = selectedArtistId
    ? {
        placed: home.placements.placed.filter((pitch) =>
          matchesArtist(pitch.releaseId),
        ),
        underReview: home.placements.underReview.filter((pitch) =>
          matchesArtist(pitch.releaseId),
        ),
      }
    : home.placements;

  const [showAll, setShowAll] = useState(false);
  const focus = pickFocusTask(yourTasks);
  const listTasks = withoutTask(yourTasks, focus?.task.id ?? null);

  return (
    <div className="home-scene-container space-y-5">
      <div className="space-y-4">
        <HomeHeaderRow header={home.header} />
      </div>
      {focus ? (
        <FocusTaskCard focus={focus} />
      ) : (
        <UpNextCard next={pickUpNext(home.nextShow, releases)} />
      )}
      <AttentionCards
        items={buildAttentionItems({
          yourTasks,
          waiting: { tasks: waitingTasks, djLinks: home.waiting.djLinks },
          placements,
          nextShow: home.nextShow,
        })}
      />
      {yourTasks.late.length === 0 ? (
        <ChappiSpeaksCard line={pickChappiSpeaks({ releases })} />
      ) : null}
      <OnboardingBar progress={buildOnboardingProgress(live.releases)} />
      <BriefCard />
      {/* Right above the fold button: the one thing to do, then a place to ask. */}
      <HomeAskBar />
      {/* The long lists stay folded so Home opens on one thing to do, not a wall
          of sections. Nothing is removed: one tap shows all of it. */}
      <button
        type="button"
        onClick={() => setShowAll((open) => !open)}
        aria-expanded={showAll}
        aria-controls="home-everything"
        className="motion-focus flex min-h-11 w-full items-center justify-between rounded-xl border border-stroke-default bg-bg-surface px-4 text-sm font-medium text-content-primary hover:border-stroke-strong"
      >
        {showAll ? "Hide the full list" : "See everything"}
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 text-content-tertiary transition-transform ${showAll ? "rotate-180" : ""}`}
        />
      </button>
      {showAll ? (
        <div id="home-everything" className="home-two-col">
          <div className="space-y-5">
            <YourTasksSection yourTasks={listTasks} />
            <WaitingOnOthersSection
              tasks={waitingTasks}
              djLinks={home.waiting.djLinks}
              onTimeCount={live.waitingOnTimeCount}
            />
          </div>
          <div className="space-y-5">
            <NextShowSection nextShow={home.nextShow} />
            <ReleasesSection releases={releases} />
            <PlacementsSection placements={placements} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
