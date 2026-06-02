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
  const pageLayoutClassName = isDashboardRoute
    ? 'app-layout app-layout-fluid'
    : isPreSavePublicRoute
      ? 'app-layout'
      : 'app-layout app-layout-centered';

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
        // Stage 2: sidebar removed. The flex-col wrapper takes the full
        // width inside the page-level max-w-[1680px] cap; the main area
        // reclaims the horizontal space the rail used to occupy. The
        // topbar's own sticky positioning is unaffected (it sticks to the
        // viewport, not this wrapper).
        <div className={`${pageLayoutClassName} lazy-fade lazy-fade-in`}>
          <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col">
            <AppTopbar onNewRelease={openCreateRelease} userName={workspaceUserName} />
            <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-5 md:px-6 md:pb-10 lg:px-8">
              {children}
            </main>
          </div>
        </div>
      ) : (
        <div className={`${pageLayoutClassName} lazy-fade lazy-fade-in`}>{children}</div>
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
