'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { useHomeStore } from '@/stores/useHomeStore';
import { selectHomeMovesSettled, useNextMovesStore } from '@/stores/useNextMovesStore';
import { HomeSkeleton } from '@/components/loading/HomeSkeleton';
import { RolloutCreateFlow } from '@/components/releases/RolloutCreateFlow';
import { RolloutOfferCard } from '@/components/home/RolloutOfferCard';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { FirstDaysCard } from '@/components/home/FirstDaysCard';
import { HomeFour, HomeLoadError } from '@/components/home/v2/HomeFour';
import { HomeAskBar } from '@/components/home/HomeAskBar';
import { HomeDesktopSplit } from '@/components/home/HomeDesktopSplit';
import { NpsPrompt } from '@/components/home/NpsPrompt';
import { PersonaAskCard } from '@/components/home/PersonaAskCard';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';

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
export default function HomePageClient({ swipe = false }: { swipe?: boolean } = {}) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { data: home, isLoading: homeLoading, error: homeError, load: loadHome } = useHomeStore();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const isDesktop = useIsDesktopViewport();
  const viewerKey = user?.id ?? null;
  const loadMoves = useNextMovesStore((state) => state.load);
  const movesSettled = useNextMovesStore(selectHomeMovesSettled(viewerKey));

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  // Dismissed next moves are asked for alongside /api/home, and Home waits for
  // them (URG-364). Before, the ask went out only once the One Thing mounted,
  // so a move dismissed on another device (the iPhone app keeps its own local
  // copy) painted for a frame as the old "Open it" card, then swapped for the
  // task card when the server's list landed. The store gives up after 4s.
  useEffect(() => {
    if (viewerKey) loadMoves(viewerKey);
  }, [viewerKey, loadMoves]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    // Backstop if the session wasn't readable at mount (no-op otherwise).
    void loadHome();
  }, [authLoading, loadHome, router, user]);

  // No welcome tour and no first-rollout lock (2026-10-24): a team with no
  // rollouts gets one quiet card here, "Got a release coming?"
  // (RolloutOfferCard, lib/rollout-offer.ts), and can look around freely.

  // A failed first load used to leave the skeleton up for good (URG-320).
  if (!authLoading && !homeLoading && !home && homeError) {
    return (
      <div className="home-scene-container">
        <HomeLoadError onRetry={() => void loadHome({ force: true })} />
      </div>
    );
  }

  // One skeleton, then the finished Home: never an in-between One Thing.
  if (authLoading || homeLoading || !home || !movesSettled) {
    return <HomeSkeleton />;
  }

  const openCreate = () => setIsCreateModalOpen(true);
  const viewerId = user?.id ?? '';
  // Four blocks, two states (URG-320, 2026-10-16): a rollout in flight, or
  // nothing in flight. A brand-new account keeps its one-line welcome.
  const stateView = <HomeFour home={home} viewerId={viewerId} onNewRollout={openCreate} />;
  // Fenced (2026-10-09): if Home's own column cannot draw, the page keeps its
  // chat and a way to the catalogue instead of the full-page crash screen.
  // Each block inside is fenced too (HomeBlocks), so this is the outer net.
  const view = (
    <ErrorBoundary name="home-view" onError={reportBoundaryError} fallback={<HomeViewFallback />}>
      {/* "Got a release coming?": zero-rollout teams only, until Not now. */}
      <ErrorBoundary name="home-block-rollout-offer" onError={reportBoundaryError}>
        <RolloutOfferCard />
      </ErrorBoundary>
      {stateView}
      {/* Your first 14 days (self-serve checkout, 2026-10-22): only for a
          team that paid at checkout; draws nothing otherwise. */}
      <ErrorBoundary name="home-block-first-days" onError={reportBoundaryError}>
        <FirstDaysCard userId={viewerId} onNewRollout={openCreate} />
      </ErrorBoundary>
    </ErrorBoundary>
  );

  return (
    <>
      {swipe ? (
        // The swipe navigation (URG-380): Home is one column on every width;
        // the conversation lives on the UrgAns tab and the frame owns the box.
        <div className="home-scene-container swipe-home pb-6 pt-1">{view}</div>
      ) : isDesktop && CHAPPI_ENABLED ? (
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
      {/* "Who are you?" once, for an account that never answered (URG-262).
          Who: lib/persona-ask.ts. Waits for no other prompt to be open. */}
      {!isCreateModalOpen ? <PersonaAskCard /> : null}

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
    <div className="rounded-[20px] border border-stroke-default bg-bg-surface p-5">
      <p className="text-base font-semibold text-content-primary">Part of Home didn&apos;t load.</p>
      <p className="mt-1 text-sm text-content-secondary">Your rollouts are safe.</p>
      <Link
        href="/dashboard"
        className="motion-focus mt-4 inline-flex h-11 items-center rounded-full border border-stroke-default px-5 text-sm font-semibold text-content-primary hover:border-stroke-strong"
      >
        Open Artists
      </Link>
    </div>
  );
}
