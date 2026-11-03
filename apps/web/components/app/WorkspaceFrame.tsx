'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { startSwipeNav, useSwipeNav } from '@/stores/useSwipeNavStore';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';
import { TopNav } from '@/components/shell/TopNav';
import { SubNav } from '@/components/shell/SubNav';
import { MainMorph } from '@/components/motion/MainMorph';
import { Sidebar } from '@/components/shell/Sidebar';
import { SETTINGS_PAGE_HREF } from '@/lib/swipe-nav';
import { noteInAppPath } from '@/lib/in-app-history';
import { PageBar } from '@/components/shell/PageBar';
import { BottomBar } from '@/components/shell/BottomBar';
import { KeyboardShortcuts } from '@/components/shell/KeyboardShortcuts';
import { TeamReadOnlyStrip } from '@/components/app/TeamReadOnlyStrip';
import { TeamTrialStrip } from '@/components/app/TeamTrialStrip';
import { RenewalStrip } from '@/components/app/RenewalStrip';
import { UrgansUsageStrip } from '@/components/app/UrgansUsageStrip';
import { PolicyUpdateStrip } from '@/components/app/PolicyUpdateStrip';
import { OfflineBanner } from '@/components/app/OfflineBanner';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { isHomeLocation } from '@/lib/home-path';
import { useReleaseParamStore } from '@/stores/useReleaseParamStore';
import { ReleaseParamSync } from './ReleaseParamSync';
import { RootShellSkeleton } from '@/components/loading/RootShellSkeleton';
import { WorkspacePageErrorBoundary } from '@/components/app/WorkspacePageErrorBoundary';
import { ChappiHistoryBridge } from '@/components/chappi/ChappiHistoryBridge';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
// One shared copy of the workspace stores (URG-314 batch 7). Every workspace
// page, its loading fallback, the search bar and the UrgAns launcher import
// these; each is its own client chunk, and without a copy here each chunk
// carried its own (useTaskStore three times on /dashboard). Loaded with the
// frame, they are available to all of them. Side-effect imports on purpose:
// the frame itself reads none of them.
import '@/stores/useTaskStore';
import '@/stores/useReleaseStore';
import '@/stores/useSceneDataStore';

/**
 * The workspace chrome: top bar, side menu, page bar, phone bottom bar, the
 * search bar and the floating UrgAns launcher (URG-314 batch 7, 2026-10-16).
 *
 * Mounted by the /dashboard and /settings route layouts, the only routes that
 * ever show it, instead of by AppShell in the root layout. Same markup, same
 * conditions and same order as when AppShell rendered it, so nothing on screen
 * changes; what changes is that its code ships only with those routes, and
 * /auth, onboarding and every public page stop downloading the app frame.
 *
 * Why this works now when two earlier attempts did not: there is no
 * app/loading.tsx any more (each segment that needs one has its own), so no
 * Suspense boundary sits ABOVE these layouts. Anything the frame waits on while
 * the server renders it (its own code arriving) holds the first paint the way
 * AppShell did, instead of being swapped in after a brand-mark fallback. Do not
 * add app/loading.tsx back; see PERFORMANCE.md, "Workspace chrome lives in the
 * workspace layouts".
 *
 * AppShell still decides the cases that replace the page entirely (the
 * artist-name gate); when one applies this frame is not mounted at all.
 */

// The search bar and the floating UrgAns launcher are not needed for first
// paint. SSR is kept (no ssr:false) so a signed-in first paint is unchanged.
const CommandBar = dynamic(() =>
  import('@/components/shell/CommandBar').then((m) => m.CommandBar)
);
// The swipe navigation (URG-380): its own chrome, fetched only for a person
// it is switched on for, so everyone else downloads none of it.
const SwipeFrame = dynamic(() =>
  import('@/components/shell/swipe/SwipeFrame').then((m) => m.SwipeFrame)
);
const FloatingUrgAns = dynamic(() =>
  import('@/components/shell/FloatingUrgAns').then((m) => m.FloatingUrgAns)
);

// UrgAns is a floating button and drawer on every workspace page.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';
const CHAT_HISTORY_ENABLED = isChappiHistoryEnabled();

export function WorkspaceFrame({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();
  // Home and a rollout share /dashboard since Oct 30, 2026; ?release= tells
  // them apart (read through a store: useSearchParams here would fail the build).
  const releaseParam = useReleaseParamStore((state) => state.releaseId);
  const swipeNav = useSwipeNav();
  useEffect(() => {
    startSwipeNav();
  }, []);
  useEffect(() => {
    noteInAppPath(pathname ?? '', SETTINGS_PAGE_HREF);
  }, [pathname]);

  // The same rules AppShell used, narrowed to the routes this frame is mounted
  // on (/dashboard/* and /settings): a curator-only account has no workspace to
  // put chrome around (AppShell sends it to /curator), and a signed-out visitor
  // gets the plain page while auth sends them on.
  const isCuratorAccount = user?.role === 'curator';
  const showWorkspaceChrome = (isAuthenticated || isAuthLoading) && !isCuratorAccount;
  const showHelpMenu = isAuthenticated && !isAuthLoading && !isCuratorAccount;
  const workspaceUserName = user?.name || user?.artist_name || user?.email || '';

  // ChappiDock renders null on this exact route (the page IS the chat), so
  // the pb-28 every other dashboard page carries to clear the dock's corner
  // launcher just floats the message box mid-screen here. See the
  // .chappi-main-padding rule in globals.css.
  const isChappiRoute = pathname === '/dashboard/urgans';
  // The bottom bar is 4rem tall below lg and needs clearing; from lg up there is
  // none. The assistant's own page has its own sizing (see globals.css), and
  // Home also clears the UrgAns box pinned above the bar (2026-10-07).
  const mainPaddingClass = isChappiRoute
    ? 'chappi-main-padding-nav'
    : isHomeLocation(pathname, releaseParam ? `release=${releaseParam}` : '')
      ? 'home-main-padding'
      : 'mobile-nav-clearance';

  if (swipeNav && showWorkspaceChrome) {
    return (
      <>
        {CHAT_HISTORY_ENABLED ? <ChappiHistoryBridge /> : null}
        <ReleaseParamSync />
        <SwipeFrame userName={workspaceUserName} showHelp={showHelpMenu}>
          {children}
        </SwipeFrame>
      </>
    );
  }

  // Settings on a computer covers the whole screen (Nov 2, 2026, founder
  // approved docs/mocks/desktop-settings-full): no top bar, no side menu, no
  // floating launcher. The page draws its own X back to where you were.
  if (pathname === SETTINGS_PAGE_HREF && showWorkspaceChrome) {
    return (
      <>
        {CHAT_HISTORY_ENABLED ? <ChappiHistoryBridge /> : null}
        <ReleaseParamSync />
        <div className="app-layout min-h-dvh">
          <main id="main-content" tabIndex={-1} className="min-h-dvh pb-10 focus:outline-none">
            <WorkspacePageErrorBoundary>
              <Suspense fallback={<RootShellSkeleton />}>{children}</Suspense>
            </WorkspacePageErrorBoundary>
          </main>
        </div>
        <ErrorBoundary name="command-bar" onError={reportBoundaryError}>
          <CommandBar />
        </ErrorBoundary>
      </>
    );
  }

  return (
    <>
      {CHAT_HISTORY_ENABLED ? <ChappiHistoryBridge /> : null}
      <ReleaseParamSync />
      {showWorkspaceChrome ? (
        // PAGE WIDTH SOURCE OF TRUTH.
        // The inner mx-auto max-w-[1440px] wrapper below is the ONLY place
        // that decides how wide an authenticated page renders. TopNav and
        // <main> both sit inside it so chrome (topbar nav, scrollbar
        // alignment) and content edges share one value — navigating between
        // /dashboard and /settings cannot produce a width jump.
        //
        // Pages MUST NOT add their own outer max-width. If a page wants its
        // content narrower (e.g. Settings constrains forms to ~960px for
        // readability) it adds an INNER wrapper, not an outer one. See the
        // long-form rationale at the top of globals.css's `.app-layout`
        // block — the prior route-keyed system here (.app-layout-fluid vs
        // .app-layout-centered) was the bug.
        <div className="app-layout lazy-fade lazy-fade-in">
          {/* app-shell-frame is a hook, not a style: it lets globals.css drop
              this floor while the on-screen keyboard is up, so the document
              cannot be scrolled by the keyboard's height into the empty band
              underneath. See the keyboard-aware block there.
              min-h-dvh, NOT min-h-screen: on mobile Safari, min-h-screen's
              static 100vh is the LARGE viewport (address bar collapsed),
              which is taller than the actual visible viewport the moment the
              address bar is showing. That mismatch alone made a "locked,
              never-scrolls" route (e.g. /dashboard/urgans, sized in dvh)
              scrollable by exactly the address bar's height — one swipe was
              enough to shift the whole page and reveal it. 100dvh tracks the
              real visible viewport instead, so there is no residual slack. */}
          <div className="app-shell-frame mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col">
            {/* First stop for a keyboard user on every page: the topbar and the
                side menu come before the content, so without this every page
                costs a dozen Tab presses to reach. Hidden until focused. */}
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-content-inverse"
            >
              Skip to content
            </a>
            {/* Trial indicator, above the topbar rather than in it: the
                topbar's right cluster has a documented width budget that
                already overflows a 375px phone, so a countdown there would
                break phones. Renders nothing outside the last stretch of a
                trial, and nothing at all while the flag is off. */}
            <OfflineBanner />
            <TeamTrialStrip />
            <RenewalStrip />
            <TeamReadOnlyStrip />
            {/* Assistant-usage indicator, same slot and same contract.
                Renders only for a team inside the last fifth of its monthly
                AI actions, which today is nobody: no code path can write
                the capped tier yet. */}
            <UrgansUsageStrip />
            <PolicyUpdateStrip />
            {/* The shell (design overhaul, 2026-10-04): a top bar of the six
                areas, the page, and on a phone a bottom bar.
                URG-254 (founder call, 2026-10-14): on a computer the second
                row of tabs is gone. The open area's pages run down a side
                menu under the top bar (an open rollout's own menu nested
                under Rollouts), and the page's name and tools sit in a page
                bar above the page. An area with one page has no side menu.
                On a phone, the tab row and the bottom bar, unchanged. */}
            <TopNav />
            <SubNav />
            <div className="flex min-w-0 flex-1">
              {/* The account menu (profile icon) sits at the foot of the
                  side menu on a desktop (2026-10-17); on a phone its rows
                  are in the bottom bar's More sheet. */}
              <Sidebar userName={workspaceUserName} showHelp={showHelpMenu} />
              <main
                id="main-content"
                tabIndex={-1}
                className={`min-w-0 flex-1 px-4 focus:outline-none sm:px-5 lg:px-8 ${mainPaddingClass}`}
              >
                <PageBar />
                {/* The page's own Suspense boundary, inside the chrome, with
                    the same fallback app/loading.tsx used to give. A page
                    that bails out of static rendering (useSearchParams; the
                    dashboard's own WorkspaceSkeleton reads it too) is caught
                    here, so the server HTML keeps the top bar and side menu
                    around the brand mark exactly as it did when AppShell
                    rendered the frame. */}
                <WorkspacePageErrorBoundary>
                  <Suspense fallback={<RootShellSkeleton />}>
                    <MainMorph>{children}</MainMorph>
                  </Suspense>
                </WorkspacePageErrorBoundary>
              </main>
            </div>
          </div>
        </div>
      ) : (
        // Signed out (auth is about to send them on) or a curator-only account
        // (AppShell sends it to /curator): the page without chrome, in the same
        // wrapper AppShell gives every other non-chrome page.
        <div className="app-layout lazy-fade lazy-fade-in">{children}</div>
      )}
      {/* The floating UrgAns button and drawer, and the search bar. Wrapped
          because they sit OUTSIDE app/error.tsx's reach: losing the launcher
          silently is a real cost, but strictly less than losing the whole
          application because a floating widget threw. */}
      {showHelpMenu && CHAPPI_ENABLED && showWorkspaceChrome ? (
        <ErrorBoundary name="urgans-launcher" onError={reportBoundaryError}>
          <FloatingUrgAns />
        </ErrorBoundary>
      ) : null}
      {showWorkspaceChrome ? (
        <>
          <ErrorBoundary name="command-bar" onError={reportBoundaryError}>
            <CommandBar />
          </ErrorBoundary>
          <ErrorBoundary name="keyboard-shortcuts" onError={reportBoundaryError}>
            <KeyboardShortcuts />
          </ErrorBoundary>
          <BottomBar showHelp={showHelpMenu} />
        </>
      ) : null}
    </>
  );
}
