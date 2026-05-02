'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import { ArtistNameGate } from '@/components/ArtistNameGate';
import { HelpMenu } from '@/components/app/HelpMenu';
import { AppSidebar } from '@/components/app/AppSidebar';
import { AppSidebarSkeleton } from '@/components/app/AppSidebarSkeleton';
import { TrialStatusBanner } from '@/components/billing/TrialStatusBanner';
import { FirstTimeOnboardingGate } from '@/components/onboarding/FirstTimeOnboardingGate';
import { TaskUIProvider } from '@/components/tasks/TaskUIProvider';
import { SupportChat } from '@/components/support/SupportChat';

const shouldLoadVercelAnalytics = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true';

export function AppShell({ children }: { children: ReactNode }) {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();

  const isAuthRoute = pathname?.startsWith('/auth');
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isPreSavePublicRoute = pathname?.startsWith('/p/');
  const isSettingsRoute = pathname === '/settings';
  const isPublicStandaloneRoute =
    pathname === '/' ||
    pathname?.startsWith('/credits/') ||
    pathname?.startsWith('/listen/') ||
    isPreSavePublicRoute;
  const hasCompletedOnboarding = user?.onboarding_completed === true;
  const showWorkspaceSidebar = isAuthenticated && !isAuthLoading && (isDashboardRoute || isSettingsRoute);
  const showWorkspaceSidebarSkeleton = isAuthLoading && (isDashboardRoute || isSettingsRoute);
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

  const renderWorkspaceShell = (sidebar: ReactNode) => (
    <div className={`${pageLayoutClassName} lazy-fade lazy-fade-in`}>
      <div className="mx-auto flex w-full max-w-[1480px] gap-4 px-0 md:px-4 lg:gap-5 lg:px-6">
        {sidebar}
        <div className="min-w-0 flex-1 px-0 pb-32 pt-0 md:px-0 md:pb-8 md:pt-0">
          {children}
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    if (!isAuthenticated || !user) {
      void checkAuth();
    }
  }, [checkAuth, isAuthenticated, user]);

  return (
    <TaskUIProvider>
      {requiresArtistNameGate ? (
        <ArtistNameGate />
      ) : showWorkspaceSidebar ? (
        renderWorkspaceShell(<AppSidebar userName={user?.name || user?.artist_name || user?.email || ''} />)
      ) : showWorkspaceSidebarSkeleton ? (
        renderWorkspaceShell(<AppSidebarSkeleton pathname={pathname || ''} />)
      ) : (
        <div className={`${pageLayoutClassName} lazy-fade lazy-fade-in`}>{children}</div>
      )}
      {showHelpMenu ? <HelpMenu /> : null}
      {showHelpMenu ? <SupportChat /> : null}
      {shouldLoadVercelAnalytics ? <Analytics /> : null}
      <Suspense fallback={null}>
        <FirstTimeOnboardingGate />
      </Suspense>
    </TaskUIProvider>
  );
}
