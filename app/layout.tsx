'use client';

import { Suspense, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useSearchParams } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import "./globals.css";
import { ArtistNameGate } from '@/components/ArtistNameGate';
import { SchemaWarningBanner } from '@/components/SchemaWarningBanner';

const PostAuthScreen = dynamic(
  () => import('@/components/PostAuthScreen').then((mod) => mod.PostAuthScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-bg-base text-content-primary">
        <div className="skeleton-card w-full max-w-xl p-8">
          <div className="h-8 w-48 rounded-lg skeleton-shimmer" />
          <div className="mt-4 space-y-3">
            <div className="skeleton-line skeleton-shimmer w-full" />
            <div className="skeleton-line skeleton-shimmer w-4/5" />
          </div>
        </div>
      </div>
    ),
  }
);

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
  const searchParams = useSearchParams();

  const isAuthRoute = pathname?.startsWith('/auth');
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isDashboardRootRoute = pathname === '/dashboard';
  const hasOnboardingIntent =
    isDashboardRootRoute &&
    (searchParams?.has('startOnboarding') || searchParams?.has('planId'));
  const showPostAuthScreen =
    isAuthenticated &&
    !isAuthLoading &&
    !isAuthRoute &&
    isDashboardRootRoute &&
    hasOnboardingIntent;
  const requiresArtistNameGate =
    isAuthenticated &&
    !isAuthLoading &&
    !isAuthRoute &&
    user?.role === 'artist' &&
    !String(user?.artist_name || '').trim();
  const pageLayoutClassName = isDashboardRoute ? 'app-layout app-layout-fluid' : 'app-layout app-layout-centered';

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <>
      {requiresArtistNameGate ? (
        <ArtistNameGate />
      ) : showPostAuthScreen ? (
        <PostAuthScreen />
      ) : (
        <div className={`${pageLayoutClassName} lazy-fade lazy-fade-in`}>{children}</div>
      )}
      <SchemaWarningBanner enabled={isAuthenticated && !isAuthRoute} />
      {!showPostAuthScreen && !requiresArtistNameGate && (
        <div className="keyboard-hint">
          <kbd className="kbd">⌘</kbd>
          <kbd className="kbd">K</kbd>
          <span>Quick actions</span>
        </div>
      )}
      <Analytics />
    </>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <html lang="en" suppressHydrationWarning data-theme="dark" className="dark">
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
        <Suspense
          fallback={
            <div className="app-layout app-layout-centered lazy-fade lazy-fade-in">{children}</div>
          }
        >
          <AppShell>{children}</AppShell>
        </Suspense>
      </body>
    </html>
  );
}
