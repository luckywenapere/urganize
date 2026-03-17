'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import './globals.css';
import { ArtistNameGate } from '@/components/ArtistNameGate';
import { AppSidebar } from '@/components/app/AppSidebar';
import { AppSidebarSkeleton } from '@/components/app/AppSidebarSkeleton';

const shouldLoadVercelAnalytics = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true';

function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();

  const isAuthRoute = pathname?.startsWith('/auth');
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isSettingsRoute = pathname === '/settings';
  const showWorkspaceSidebar = isAuthenticated && !isAuthLoading && (isDashboardRoute || isSettingsRoute);
  const showWorkspaceSidebarSkeleton = isAuthLoading && (isDashboardRoute || isSettingsRoute);
  const requiresArtistNameGate =
    isAuthenticated &&
    !isAuthLoading &&
    !isAuthRoute &&
    user?.role === 'artist' &&
    !String(user?.artist_name || '').trim();
  const pageLayoutClassName = isDashboardRoute ? 'app-layout app-layout-fluid' : 'app-layout app-layout-centered';

  const renderWorkspaceShell = (sidebar: React.ReactNode) => (
    <div className={`${pageLayoutClassName} lazy-fade lazy-fade-in`}>
      <div className="mx-auto flex w-full max-w-[1480px] gap-2 px-0 md:px-4">
        {sidebar}
        <div className="min-w-0 flex-1 px-0 pb-28 pt-16 md:px-0 md:pb-0 md:pt-0">{children}</div>
      </div>
    </div>
  );

  useEffect(() => {
    if (!isAuthenticated || !user) {
      void checkAuth();
    }
  }, [checkAuth, isAuthenticated, user]);

  return (
    <>
      {requiresArtistNameGate ? (
        <ArtistNameGate />
      ) : showWorkspaceSidebar ? (
        renderWorkspaceShell(<AppSidebar userName={user?.name || user?.artist_name || user?.email || ''} />)
      ) : showWorkspaceSidebarSkeleton ? (
        renderWorkspaceShell(<AppSidebarSkeleton pathname={pathname || ''} />)
      ) : (
        <div className={`${pageLayoutClassName} lazy-fade lazy-fade-in`}>{children}</div>
      )}
      {!requiresArtistNameGate && (
        <div className="keyboard-hint">
          <kbd className="kbd">Cmd</kbd>
          <kbd className="kbd">K</kbd>
          <span>Quick actions</span>
        </div>
      )}
      {shouldLoadVercelAnalytics ? <Analytics /> : null}
    </>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="light" className="light">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var key = 'urganize.theme';
                  var stored = localStorage.getItem(key);
                  var resolved = stored === 'light' || stored === 'dark'
                    ? stored
                    : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
                  var root = document.documentElement;
                  root.dataset.theme = resolved;
                  root.classList.remove('dark', 'light');
                  root.classList.add(resolved);
                } catch (_) {}
              })();
            `,
          }}
        />
      </head>
      <body className="app-body bg-bg-base text-content-primary antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
