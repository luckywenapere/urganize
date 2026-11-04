'use client';

import { Suspense, useEffect, useRef, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import { SESSIONS_HREF, swipeAreaForPath, swipeTabForPath } from '@/lib/swipe-nav';
import { nextHomeMemory, type TabMemoryPlace } from '@/lib/tab-memory';
import { useTabMemoryStore } from '@/stores/useTabMemoryStore';
import { useSettingsPageStore } from '@/stores/useSettingsPageStore';
import { RECORD_CAPTURE_PLACEHOLDER, recordIdFromPath } from '@/lib/chappi/record-scope';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';
import { useNeedsYouStore } from '@/stores/useNeedsYouStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { showProjectSession, showRolloutSession } from '@/stores/useChappiHistoryStore';
import { useProjectChatStore } from '@/stores/useProjectChatStore';
import { useSessionsViewStore, whenSessionReady } from '@/stores/useSessionsViewStore';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { displayReleaseTitle } from '@/types/releases';
import { SwipeTopBar } from './SwipeTopBar';
import { SwipePager } from './SwipePager';
import { UrgAnsPane, showMain } from './UrgAnsPane';
import { SessionsPane } from './SessionsPane';
import { SettingsPane } from './SettingsPane';
import { BackPill } from './BackPill';

const CommandBar = dynamic(() => import('@/components/shell/CommandBar').then((m) => m.CommandBar));
const FloatingUrgAns = dynamic(() => import('@/components/shell/FloatingUrgAns').then((m) => m.FloatingUrgAns));
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

/**
 * The workspace chrome when the swipe navigation is on (URG-380). Replaces the
 * top bar, the phone's tab row and bottom bar, and the More sheet:
 *
 *  - On Home and Assistant (Team moved to the account page Nov 1, 2026): the top tabs over the pager, one app-height
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
  // /dashboard is the Artists tab; /dashboard?release=<id> is a rollout, a
  // pushed page drawn over it (Oct 30, 2026: the artist list moved to /dashboard).
  const searchParams = useSearchParams();
  const tab = swipeTabForPath(pathname, searchParams);
  const onTab = tab !== null;
  const loadNeedsYou = useNeedsYouStore((state) => state.load);
  const sessionOpen = useSessionsViewStore((state) => state.releaseId !== null);
  const settingOpen = useSettingsPageStore((state) => state.target !== null);

  // Home remembers the rollout or artist page you left it on (lib/tab-memory.ts).
  const searchString = searchParams.toString();
  const lastPlace = useRef<TabMemoryPlace | null>(null);
  useEffect(() => {
    const place: TabMemoryPlace = {
      path: `${pathname}${searchString ? `?${searchString}` : ''}`,
      onTab,
      area: swipeAreaForPath(pathname, searchString),
    };
    const store = useTabMemoryStore.getState();
    store.setHomePath(nextHomeMemory(store.homePath, lastPlace.current, place));
    lastPlace.current = place;
  }, [pathname, searchString, onTab]);

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
          {/* Inside one setting the page is full screen: no tabs above it
              (founder, Nov 2, 2026, with the reference). */}
          {tab === 'settings' && settingOpen ? null : <SwipeTopBar showHelp={showHelp} pagerActive />}
          <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col focus:outline-none">
            <WorkspacePageErrorBoundary>
              <SwipePager
                panes={{
                  artists: (
                    <div className="swipe-page mx-auto w-full max-w-[40rem] px-5">
                      <ArtistsPageClient swipe active={tab === 'artists'} />
                    </div>
                  ),
                  urgans: CHAPPI_ENABLED ? <UrgAnsPane active={tab === 'urgans'} /> : null,
                  sessions: CHAPPI_ENABLED ? <SessionsPane active={tab === 'sessions'} /> : null,
                  settings: <SettingsPane showHelp={showHelp} />,
                }}
              />
            </WorkspacePageErrorBoundary>
          </main>
          <BackPill active={tab === 'sessions'} />
          {/* The Sessions list has nowhere to send a message: a session is opened first. */}
          {CHAPPI_ENABLED && tab !== 'settings' && !(tab === 'sessions' && !sessionOpen) ? (
            <SwipeComposer onUrgAns={tab === 'urgans' || tab === 'sessions'} sessionOpen={tab === 'sessions'} />
          ) : null}
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
 * The one "Message UrgAns…" box, shared by Home and Assistant (URG-380).
 * On UrgAns it hands the text to the conversation on screen. On Artists and
 * Team it always posts to Main: Main is put on screen first, then the
 * message is handed over and the pager glides to UrgAns, where the
 * conversation sends it.
 */
function SwipeComposer({ onUrgAns, sessionOpen = false }: { onUrgAns: boolean; sessionOpen?: boolean }) {
  const replyInFlight = useChappiStore((state) => state.replyInFlight);
  const sessionTitle = useReleaseStore((state) => {
    const id = useSessionsViewStore.getState().releaseId;
    return id ? state.releases.find((release) => release.id === id)?.title ?? null : null;
  });
  return (
    <HomeAskBar
      variant="swipe"
      placeholder={sessionOpen && sessionTitle ? `Message AI about ${displayReleaseTitle(sessionTitle)}...` : undefined}
      replying={onUrgAns && replyInFlight}
      onSend={() => {
        if (onUrgAns) {
          // On a session tab the rollout's chat may still be loading: wait for
          // it, so the message lands in that session (Codex review on #1022).
          const openId = sessionOpen ? useSessionsViewStore.getState().releaseId : null;
          if (openId) {
            void whenSessionReady(openId).then(() => useChappiStore.getState().setSendInputOnOpen(true));
            return;
          }
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
          store.setScopedRecordId(null);
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
  // On a record page the box files into that record (next record v2): the id
  // travels with the message to the UrgAns tab.
  const recordId = recordIdFromPath(usePathname());
  return (
    <HomeAskBar
      variant="page"
      placeholder={recordId ? RECORD_CAPTURE_PLACEHOLDER : undefined}
      onSend={() => {
        const held = useChappiStore.getState();
        const text = held.input;
        const files = held.pendingAttachments;
        // A rollout page talks to that rollout's own session (Nov 2, 2026):
        // the message is handed to it, the Sessions tab opens on it, and a
        // brief pill offers the way straight back to this page.
        if (releaseId && !recordId) {
          const rollout = useReleaseStore.getState().releases.find((release) => release.id === releaseId);
          const returnTo = `${window.location.pathname}${window.location.search}`;
          void showRolloutSession(releaseId).then(() => {
            const store = useChappiStore.getState();
            store.setInput(text);
            store.setPendingAttachments(files);
            store.setScopedRecordId(null);
            store.setScopedReleaseId(releaseId);
            store.setSendInputOnOpen(true);
            const view = useSessionsViewStore.getState();
            view.setPinnedScope(true);
            view.open(releaseId);
            view.setBackTo({ href: returnTo, label: rollout ? displayReleaseTitle(rollout.title) : 'the rollout' });
            router.push(SESSIONS_HREF);
          });
          return;
        }
        // A project page keeps the conversation on the page (2026-11-04,
        // #1074, mock screen 6): the message goes to the project's own chat in
        // a sheet over the page (ProjectChatSheet), not to the AI tab.
        if (recordId) {
          void showProjectSession(recordId).then(() => {
            const store = useChappiStore.getState();
            store.setInput(text);
            store.setPendingAttachments(files);
            store.setScopedReleaseId(null);
            store.setScopedRecordId(recordId);
            store.setSendInputOnOpen(true);
            useProjectChatStore.getState().open(recordId);
          });
          return;
        }
        if (releaseId) held.setScopedReleaseId(releaseId);
        void showMain().then(() => {
          const store = useChappiStore.getState();
          store.setInput(text);
          store.setPendingAttachments(files);
          store.setScopedRecordId(recordId);
          store.setSendInputOnOpen(true);
          router.push('/dashboard/urgans');
        });
      }}
    />
  );
}
