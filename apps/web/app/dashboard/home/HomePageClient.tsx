'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useHomeStore } from '@/stores/useHomeStore';
import { HomeSkeleton } from '@/components/loading/HomeSkeleton';
import { RolloutCreateFlow } from '@/components/releases/RolloutCreateFlow';
import { useFirstReleasePrompt } from '@/components/releases/useFirstReleasePrompt';
import { useCatalogTourAutoStart } from '@/components/tours/useCatalogTourAutoStart';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { ManagerMidReleaseView } from '@/components/home/ManagerMidReleaseView';
import { ManagerQuietView } from '@/components/home/ManagerQuietView';
import { ManagerNewView } from '@/components/home/ManagerNewView';
import { HomeAskBar } from '@/components/home/HomeAskBar';
import { HomeDesktopSplit } from '@/components/home/HomeDesktopSplit';
import { NpsPrompt } from '@/components/home/NpsPrompt';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';

const TOURS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TOURS === 'true';
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

/**
 * The Home tab's page. Fires the data load immediately (the store reads its own
 * token from getSession()), bounces on a resolved "no session", and renders ONE
 * skeleton until both auth and Home's own data are ready.
 *
 * Two layouts since 2026-10-07 (founder call):
 *  - On a computer (lg and up, with UrgAns on) Home is the chat: Home's column
 *    on the left, the conversation on the right (HomeDesktopSplit).
 *  - On a phone it is one column with the UrgAns box pinned to the bottom of
 *    the screen (HomeAskBar). Send opens the full chat page.
 * The two are mounted one at a time (useIsDesktopViewport, the WorkspaceView
 * precedent), so the conversation is never in the page twice.
 *
 * Making a rollout goes through RolloutCreateFlow, the same flow the chat page
 * uses, so the conversation's "New rollout" behaves the same in both places.
 */
export default function HomePageClient() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { data: home, isLoading: homeLoading, load: loadHome } = useHomeStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const isDesktop = useIsDesktopViewport();

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    // Backstop if the session wasn't readable at mount (no-op otherwise).
    void loadHome();
  }, [authLoading, loadHome, router, user]);

  // The deferred first-release prompt — same hook every landing surface uses.
  useFirstReleasePrompt(() => setIsCreateModalOpen(true));

  // The first-visit tour. Home is where people land, so that is where it starts.
  const releaseCount = useReleaseStore((state) => state.releases.length);
  useCatalogTourAutoStart({
    enabled: TOURS_ENABLED,
    plannerEnabled: PLANNER_ENABLED,
    releasesLoaded: !homeLoading && Boolean(home),
    releaseCount,
    scopedReleaseId: null,
    scopedTaskCount: 0,
    canCreate: true,
    onHome: true,
  });

  if (authLoading || homeLoading || !home) {
    return <HomeSkeleton />;
  }

  const openCreate = () => setIsCreateModalOpen(true);
  const viewerId = user?.id ?? '';
  const stateView =
    home.state === 'manager_new' ? (
      <ManagerNewView home={home} onNewRollout={openCreate} />
    ) : home.state === 'manager_all_clear' || home.state === 'manager_between' ? (
      <ManagerQuietView home={home} viewerId={viewerId} onNewRollout={openCreate} />
    ) : (
      <ManagerMidReleaseView home={home} viewerId={viewerId} />
    );
  // Fenced (2026-10-09): if Home's own column cannot draw, the page keeps its
  // chat and a way to the catalogue instead of the full-page crash screen.
  // Each block inside is fenced too (HomeBlocks), so this is the outer net.
  const view = (
    <ErrorBoundary name="home-view" onError={reportBoundaryError} fallback={<HomeViewFallback />}>
      {stateView}
    </ErrorBoundary>
  );

  return (
    <>
      {isDesktop && CHAPPI_ENABLED ? (
        <HomeDesktopSplit onNewRelease={openCreate}>{view}</HomeDesktopSplit>
      ) : (
        <>
          <div className="home-scene-container">{view}</div>
          <HomeAskBar />
        </>
      )}

      {/* Net Promoter Score (2026-10-11): asked on Home, between pieces of
          work, never mid-task. Who and when: lib/nps.ts. */}
      {!isCreateModalOpen ? <NpsPrompt /> : null}

      <RolloutCreateFlow
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => void loadHome({ force: true })}
      />
    </>
  );
}

/** What Home's column shows if it fails to draw: a way to the catalogue. */
function HomeViewFallback() {
  return (
    <div className="rounded-2xl border border-stroke-default bg-bg-surface p-5">
      <p className="text-sm text-content-secondary">Part of Home could not load. Your rollouts are safe.</p>
      <Link
        href="/dashboard"
        className="motion-focus mt-3 inline-flex items-center rounded-lg border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-medium text-content-primary hover:border-stroke-strong"
      >
        Open your catalog
      </Link>
    </div>
  );
}
