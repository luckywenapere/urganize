'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import "./globals.css";

const PostAuthScreen = dynamic(
  () => import('@/components/PostAuthScreen').then((mod) => mod.PostAuthScreen),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
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
  const needsOnboarding = useAuthStore((state) => state.needsOnboarding);
  const pathname = usePathname();

  const isAuthRoute = pathname?.startsWith('/auth');
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isDashboardRootRoute = pathname === '/dashboard';
  const showPostAuthScreen = isAuthenticated && !isAuthRoute && needsOnboarding && isDashboardRootRoute;
  const pageLayoutClassName = isDashboardRoute ? 'app-layout app-layout-fluid' : 'app-layout app-layout-centered';

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="app-body bg-bg-base text-content-primary antialiased">
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
