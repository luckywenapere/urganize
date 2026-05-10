'use client';

import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import { ArtistNameGate } from '@/components/ArtistNameGate';
import { HelpMenu } from '@/components/app/HelpMenu';
import { AppSidebar } from '@/components/app/AppSidebar';
import { AppSidebarSkeleton } from '@/components/app/AppSidebarSkeleton';
import { AppTopbar } from '@/components/app/AppTopbar';
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed((value) => !value);
  }, []);
  const openMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(true);
  }, []);
  const closeMobileSidebar = useCallback(() => {
    setIsMobileSidebarOpen(false);
  }, []);

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

  const workspaceUserName = user?.name || user?.artist_name || user?.email || '';

  const renderWorkspaceShell = (sidebar: ReactNode) => (
    <div className={`${pageLayoutClassName} lazy-fade lazy-fade-in`}>
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px]">
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar
            userName={workspaceUserName}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            onOpenMobileSidebar={openMobileSidebar}
          />
          <main className="min-w-0 flex-1 px-4 pb-28 pt-5 sm:px-5 md:px-6 md:pb-10 lg:px-8">
            {children}
          </main>
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
        renderWorkspaceShell(
          <AppSidebar
            userName={workspaceUserName}
            collapsed={isSidebarCollapsed}
            mobileOpen={isMobileSidebarOpen}
            onToggleCollapsed={toggleSidebar}
            onCloseMobile={closeMobileSidebar}
          />
        )
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
