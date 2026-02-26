'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import { PostAuthScreen } from '@/components/PostAuthScreen';
import "./globals.css";

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
        {showPostAuthScreen ? <PostAuthScreen /> : <div className={pageLayoutClassName}>{children}</div>}
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
