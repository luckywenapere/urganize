'use client';

import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import { ArtistNameGate } from '@/components/ArtistNameGate';
import { AppTopbar } from '@/components/app/AppTopbar';
import { TaskUIProvider } from '@/components/tasks/TaskUIProvider';
import { ToastProvider } from '@/components/shared/ToastProvider';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { CapacitorAuthBridge } from '@/components/providers/CapacitorAuthBridge';

// None of these are needed for first paint — the onboarding wizard, the
// create-release modal, and the two floating support widgets used to be
// static imports, which shipped their code (the ~1,000-line onboarding flow
// included) in the render-blocking bundle of every route, /auth included.
// next/dynamic moves each into its own async chunk that loads after hydration
// (or, for HelpMenu/SupportChat, only on the authenticated routes that render
// them). ssr:false is safe: all four render nothing on the server today.
const HelpMenu = dynamic(() => import('@/components/app/HelpMenu').then((m) => m.HelpMenu), {
  ssr: false,
});
const SupportChat = dynamic(
  () => import('@/components/support/SupportChat').then((m) => m.SupportChat),
  { ssr: false }
);
const ChappiDock = dynamic(
  () => import('@/components/chappi/ChappiDock').then((m) => m.ChappiDock),
  { ssr: false }
);
const CreateReleaseModal = dynamic(
  () => import('@/components/releases/CreateReleaseModal').then((m) => m.CreateReleaseModal),
  { ssr: false }
);
const FirstTimeOnboardingGate = dynamic(
  () =>
    import('@/components/onboarding/FirstTimeOnboardingGate').then(
      (m) => m.FirstTimeOnboardingGate
    ),
  { ssr: false }
);

const shouldLoadVercelAnalytics = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true';

// When Chappi is on, the floating dock takes the bottom-right corner and the
// WhatsApp founder line moves into its footer; with the flag off, the
// standalone SupportChat pill renders exactly as before.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

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

  const isAuthRoute =
    pathname?.startsWith('/auth') ||
    pathname === '/locked' ||
    pathname?.startsWith('/onboarding') ||
    pathname?.startsWith('/invite');
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isPreSavePublicRoute = pathname?.startsWith('/p/');
  const isLockedRoute = pathname === '/locked';
  const isOnboardingRoute = pathname?.startsWith('/onboarding');
  const isInviteRoute = pathname?.startsWith('/invite');
  const isSettingsRoute = pathname === '/settings';
  const isPublicStandaloneRoute =
    pathname === '/' ||
    pathname?.startsWith('/credits/') ||
    pathname?.startsWith('/listen/') ||
    isPreSavePublicRoute ||
    isOnboardingRoute ||
    isInviteRoute;
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
    // ToastProvider wraps TaskUIProvider so any surface inside the app shell
    // (task drawer, workspace, notifications bell) can call `useToast()`.
    // Phase 3 of notifications uses it for live-arrival toasts; the same
    // provider is available for any future "save succeeded" / "upload failed"
    // moments that currently render inline toast boxes.
    <ToastProvider>
    <CapacitorAuthBridge />
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
      {showHelpMenu ? (
        CHAPPI_ENABLED ? <ChappiDock onNewRelease={openCreateRelease} /> : <SupportChat />
      ) : null}
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
      {isLockedRoute || isOnboardingRoute || isInviteRoute ? null : (
        <Suspense fallback={null}>
          <FirstTimeOnboardingGate />
        </Suspense>
      )}
    </TaskUIProvider>
    </ToastProvider>
  );
}
