'use client';

import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import { ArtistNameGate } from '@/components/ArtistNameGate';
import { HelpMenu } from '@/components/app/HelpMenu';
import { AppTopbar } from '@/components/app/AppTopbar';
import { FirstTimeOnboardingGate } from '@/components/onboarding/FirstTimeOnboardingGate';
import { TaskUIProvider } from '@/components/tasks/TaskUIProvider';
import { SupportChat } from '@/components/support/SupportChat';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { useReleaseStore } from '@/stores/useReleaseStore';

const shouldLoadVercelAnalytics = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true';

export function AppShell({ children }: { children: ReactNode }) {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();
  // Lifted here so the universal topbar "New release" button opens the same
  // creation modal the page-level buttons use, from any dashboard page,
  // without navigating away.
  const [isCreateReleaseOpen, setIsCreateReleaseOpen] = useState(false);
  const openCreateRelease = useCallback(() => {
    setIsCreateReleaseOpen(true);
  }, []);
  const closeCreateRelease = useCallback(() => {
    setIsCreateReleaseOpen(false);
  }, []);

  const isAuthRoute = pathname?.startsWith('/auth') || pathname === '/locked';
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isPreSavePublicRoute = pathname?.startsWith('/p/');
  const isLockedRoute = pathname === '/locked';
  const isSettingsRoute = pathname === '/settings';
  const isPublicStandaloneRoute =
    pathname === '/' ||
    pathname?.startsWith('/credits/') ||
    pathname?.startsWith('/listen/') ||
    isPreSavePublicRoute;
  const hasCompletedOnboarding = user?.onboarding_completed === true;
  // Stage 2: the sidebar is gone, so the only chrome that varies between
  // "authenticated" and "still loading" is whether the WorkspaceMenu
  // monogram has the user's initial yet — and that gracefully falls back
  // to "U" when userName is empty. We collapse the two previous branches
  // (showWorkspaceSidebar / showWorkspaceSidebarSkeleton) into one.
  const showWorkspaceChrome =
    (isAuthenticated || isAuthLoading) && (isDashboardRoute || isSettingsRoute);
  const requiresArtistNameGate =
    isAuthenticated &&
    !isAuthLoading &&
    !isAuthRoute &&
    hasCompletedOnboarding &&
    user?.role === 'artist' &&
    !String(user?.artist_name || '').trim();
  const showHelpMenu =
    isAuthenticated && !isAuthLoading && !isAuthRoute && !isPublicStandaloneRoute && !requiresArtistNameGate;

  const workspaceUserName = user?.name || user?.artist_name || user?.email || '';

  useEffect(() => {
    if (!isAuthenticated || !user) {
      void checkAuth();
    }
  }, [checkAuth, isAuthenticated, user]);

  return (
    <TaskUIProvider>
      {requiresArtistNameGate ? (
        <ArtistNameGate />
      ) : showWorkspaceChrome ? (
        // PAGE WIDTH SOURCE OF TRUTH.
        // The inner mx-auto max-w-[1440px] wrapper below is the ONLY place
        // that decides how wide an authenticated page renders. AppTopbar and
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
          <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col">
            <AppTopbar onNewRelease={openCreateRelease} userName={workspaceUserName} />
            <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-5 md:px-6 md:pb-10 lg:px-8">
              {children}
            </main>
          </div>
        </div>
      ) : (
        <div className="app-layout lazy-fade lazy-fade-in">{children}</div>
      )}
      {showHelpMenu ? <HelpMenu /> : null}
      {showHelpMenu ? <SupportChat /> : null}
      <CreateReleaseModal
        open={isCreateReleaseOpen}
        onClose={closeCreateRelease}
        onCreated={() => {
          // Stay on whatever page the user was on (no forced redirect); just
          // close and refresh the release store so the new release shows up.
          // loadCommandCenter refreshes quietly when data already exists.
          closeCreateRelease();
          void useReleaseStore.getState().loadCommandCenter();
        }}
      />
      {shouldLoadVercelAnalytics ? <Analytics /> : null}
      {isLockedRoute ? null : (
        <Suspense fallback={null}>
          <FirstTimeOnboardingGate />
        </Suspense>
      )}
    </TaskUIProvider>
  );
}
