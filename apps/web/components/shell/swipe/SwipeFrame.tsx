'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import HomePageClient from '@/app/dashboard/home/HomePageClient';
import ArtistsPageClient from '@/app/dashboard/artists/ArtistsPageClient';
import { Sidebar } from '@/components/shell/Sidebar';
import { PageBar } from '@/components/shell/PageBar';
import { MainMorph } from '@/components/motion/MainMorph';
import { KeyboardShortcuts } from '@/components/shell/KeyboardShortcuts';
import { TeamReadOnlyStrip } from '@/components/app/TeamReadOnlyStrip';
import { TeamTrialStrip } from '@/components/app/TeamTrialStrip';
import { RenewalStrip } from '@/components/app/RenewalStrip';
import { UrgansUsageStrip } from '@/components/app/UrgansUsageStrip';
import { PolicyUpdateStrip } from '@/components/app/PolicyUpdateStrip';
import { OfflineBanner } from '@/components/app/OfflineBanner';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { WorkspacePageErrorBoundary } from '@/components/app/WorkspacePageErrorBoundary';
import { RootShellSkeleton } from '@/components/loading/RootShellSkeleton';
import { HomeAskBar } from '@/components/home/HomeAskBar';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { swipeTabForPath } from '@/lib/swipe-nav';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';
import { useNeedsYouStore } from '@/stores/useNeedsYouStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { SwipeTopBar } from './SwipeTopBar';
import { SwipePager } from './SwipePager';
import { UrgAnsPane, showMain } from './UrgAnsPane';

const CommandBar = dynamic(() => import('@/components/shell/CommandBar').then((m) => m.CommandBar));
const FloatingUrgAns = dynamic(() => import('@/components/shell/FloatingUrgAns').then((m) => m.FloatingUrgAns));
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

/**
 * The workspace chrome when the swipe navigation is on (URG-380). Replaces the
 * top bar, the phone's tab row and bottom bar, and the More sheet:
 *
 *  - On Home, UrgAns and Artists: the top tabs over the pager, one app-height
 *    column pinned to the visible viewport, each page scrolling on its own, and
 *    ONE "Message UrgAns…" box pinned at the bottom across all three tabs: the
 *    same instance, shape, size and place whichever tab is up, so a swipe
 *    never makes it jump (the UrgAns tab's conversation draws no box of its
 *    own; its rollout scope sits in its top row). The pager draws the three pages itself,
 *    so `children` (the route's page) is not drawn on these routes.
 *  - Anywhere else (a rollout, settings, relationships…): the same top bar over
 *    the page as it was, with the desktop side menu where the page has one.
 *
 * The old chrome (WorkspaceFrame) is untouched and still what everyone else gets.
 */
export function SwipeFrame({
  children,
  userName,
  showHelp,
}: {
  children: ReactNode;
  userName: string;
  showHelp: boolean;
}) {
  const pathname = usePathname();
  const tab = swipeTabForPath(pathname);
  const onTab = tab !== null;
  const loadNeedsYou = useNeedsYouStore((state) => state.load);

  useEffect(() => {
    void loadNeedsYou();
    const onFocus = () => void loadNeedsYou();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadNeedsYou]);

  // Tells globals.css which chrome is up (no bottom bar to clear, the dock's place).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.swipeNav = onTab ? 'tab' : 'page';
    return () => {
      delete root.dataset.swipeNav;
    };
  }, [onTab]);

  const banners = (
    <>
      <OfflineBanner />
      <TeamTrialStrip />
      <RenewalStrip />
      <TeamReadOnlyStrip />
      <UrgansUsageStrip />
            <PolicyUpdateStrip />
    </>
  );

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-content-inverse"
      >
        Skip to content
      </a>
      {onTab ? (
        <div className="swipe-frame flex flex-col bg-bg-base">
          {banners}
          <SwipeTopBar showHelp={showHelp} pagerActive />
          <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus:outline-none">
            <WorkspacePageErrorBoundary>
              <SwipePager
                panes={{
                  home: (
                    <div className="swipe-page mx-auto w-full max-w-[40rem] px-5">
                      <HomePageClient swipe />
                    </div>
                  ),
                  urgans: CHAPPI_ENABLED ? <UrgAnsPane active={tab === 'urgans'} /> : null,
                  artists: (
                    <div className="swipe-page mx-auto w-full max-w-[40rem] px-5">
                      <ArtistsPageClient swipe />
                    </div>
                  ),
                }}
              />
            </WorkspacePageErrorBoundary>
          </main>
          {CHAPPI_ENABLED ? <SwipeComposer onUrgAns={tab === 'urgans'} /> : null}
        </div>
      ) : (
        <div className="app-layout">
          <div className="mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col">
            {banners}
            <SwipeTopBar showHelp={showHelp} pagerActive={false} />
            <div className="flex min-w-0 flex-1">
              <Sidebar userName={userName} showHelp={showHelp} account={false} />
              <main
                id="main-content"
                tabIndex={-1}
                className="swipe-page-main min-w-0 flex-1 px-4 pb-10 focus:outline-none sm:px-5 lg:px-8"
              >
                <PageBar />
                <WorkspacePageErrorBoundary>
                  <Suspense fallback={<RootShellSkeleton />}>
                    <MainMorph>{children}</MainMorph>
                  </Suspense>
                </WorkspacePageErrorBoundary>
              </main>
            </div>
          </div>
        </div>
      )}
      {!onTab && CHAPPI_ENABLED ? (
        <Suspense fallback={null}>
          <PageComposer />
        </Suspense>
      ) : null}
      {!onTab && showHelp && CHAPPI_ENABLED ? (
        <ErrorBoundary name="urgans-launcher" onError={reportBoundaryError}>
          <FloatingUrgAns />
        </ErrorBoundary>
      ) : null}
      <ErrorBoundary name="command-bar" onError={reportBoundaryError}>
        <CommandBar />
      </ErrorBoundary>
      <ErrorBoundary name="keyboard-shortcuts" onError={reportBoundaryError}>
        <KeyboardShortcuts />
      </ErrorBoundary>
    </>
  );
}

/**
 * The one "Message UrgAns…" box, shared by Home, UrgAns and Artists (URG-380).
 * On UrgAns it hands the text to the conversation on screen. On Home and
 * Artists it always posts to Main: Main is put on screen first, then the
 * message is handed over and the pager glides to UrgAns, where the
 * conversation sends it.
 */
function SwipeComposer({ onUrgAns }: { onUrgAns: boolean }) {
  const replyInFlight = useChappiStore((state) => state.replyInFlight);
  return (
    <HomeAskBar
      variant="swipe"
      replying={onUrgAns && replyInFlight}
      onSend={() => {
        if (onUrgAns) {
          // The conversation is already on screen: it sends the box's text
          // (and any files, held in pendingAttachments) as soon as it is free.
          useChappiStore.getState().setSendInputOnOpen(true);
          return;
        }
        // Opening Main can replace the transcript (and the box's text with it),
        // so the message is held here and handed back once Main is on screen.
        const held = useChappiStore.getState();
        const text = held.input;
        const files = held.pendingAttachments;
        void showMain().then(() => {
          const store = useChappiStore.getState();
          store.setInput(text);
          store.setPendingAttachments(files);
          store.setSendInputOnOpen(true);
        });
        useSwipeNavStore.getState().go?.('urgans');
      }}
    />
  );
}

/**
 * The same "Message UrgAns…" box on every other phone screen (Oct 24, 2026,
 * founder call: "UrgAns should be available at the bottom of mobile for all
 * screens"). Phone only; desktops keep FloatingUrgAns. Send posts to Main like
 * Home does, scoped to the rollout on screen when there is one, then opens the
 * UrgAns tab, where the conversation sends it.
 */
function PageComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const releaseId = searchParams.get('release');
  return (
    <HomeAskBar
      variant="page"
      onSend={() => {
        const held = useChappiStore.getState();
        const text = held.input;
        const files = held.pendingAttachments;
        if (releaseId) held.setScopedReleaseId(releaseId);
        void showMain().then(() => {
          const store = useChappiStore.getState();
          store.setInput(text);
          store.setPendingAttachments(files);
          store.setSendInputOnOpen(true);
          router.push('/dashboard/urgans');
        });
      }}
    />
  );
}
