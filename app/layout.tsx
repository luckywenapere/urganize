'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import "./globals.css";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const needsOnboarding = useAuthStore((state) => state.needsOnboarding);
  const pathname = usePathname();
  const [hasOnboardingIntent, setHasOnboardingIntent] = useState(false);

  const isAuthRoute = pathname?.startsWith('/auth');
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isDashboardRootRoute = pathname === '/dashboard';
  const showPostAuthScreen =
    isAuthenticated &&
    !isAuthLoading &&
    !isAuthRoute &&
    isDashboardRootRoute &&
    (needsOnboarding || hasOnboardingIntent);
  const pageLayoutClassName = isDashboardRoute ? 'app-layout app-layout-fluid' : 'app-layout app-layout-centered';

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isDashboardRootRoute || typeof window === 'undefined') {
      setHasOnboardingIntent(false);
      return;
    }

    const query = new URLSearchParams(window.location.search);
    setHasOnboardingIntent(query.has('startOnboarding') || query.has('planId'));
  }, [isDashboardRootRoute, pathname]);

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
        <div className="fixed right-4 top-4 z-[90] md:right-6 md:top-6">
          <ThemeToggle compact />
        </div>
        {showPostAuthScreen ? (
          <PostAuthScreen />
        ) : (
          <div className={`${pageLayoutClassName} lazy-fade lazy-fade-in`}>{children}</div>
        )}
        {!showPostAuthScreen && (
          <div className="keyboard-hint">
            <kbd className="kbd">⌘</kbd>
            <kbd className="kbd">K</kbd>
            <span>Quick actions</span>
          </div>
        )}
        <Analytics />
      </body>
    </html>
  );
}
