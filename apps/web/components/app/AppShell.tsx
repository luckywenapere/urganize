'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import { RAIL_OPEN_KEY, RAIL_OPEN_VERSION, useChappiStore } from '@/stores/useChappiStore';
import { readPersistedState } from '@/lib/persisted-state';
import { ArtistNameGate } from '@/components/ArtistNameGate';
import { AndroidAppBanner } from '@/components/app/AndroidAppBanner';
import { AppTopbar } from '@/components/app/AppTopbar';
import { TeamReadOnlyStrip } from '@/components/app/TeamReadOnlyStrip';
import { TeamTrialStrip } from '@/components/app/TeamTrialStrip';
import { UrgansUsageStrip } from '@/components/app/UrgansUsageStrip';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { TaskUIProvider } from '@/components/tasks/TaskUIProvider';
import { NavigationTracker } from '@/components/app/NavigationTracker';
import { ToastProvider } from '@/components/shared/ToastProvider';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { ChunkRecoveryBridge } from '@/components/providers/ChunkRecoveryBridge';
import { CardTrialGate } from '@/components/providers/CardTrialGate';
import { HardPaywallGate } from '@/components/providers/HardPaywallGate';
import { CapacitorAuthBridge } from '@/components/providers/CapacitorAuthBridge';
import { CapacitorPushBridge } from '@/components/providers/CapacitorPushBridge';
import { KeyboardViewportBridge } from '@/components/providers/KeyboardViewportBridge';
import { registerPushServiceWorker } from '@/lib/push';
import { runWhenIdle, shouldBackgroundPrefetch } from '@/lib/connection';
import { CURATOR_HOME_PATH } from '@/lib/home-path';

/** The only routes a signed-in user navigates between. Deliberately short —
 * every entry costs a speculative request, and prefetching pages nobody opens
 * is exactly the kind of waste this work is trying to remove. */
const PREFETCHED_ROUTES = ['/dashboard', '/dashboard/urgans', '/settings'];

// None of these are needed for first paint — the onboarding wizard, the
// create-release modal, and the floating support widgets used to be
// static imports, which shipped their code (the ~1,000-line onboarding flow
// included) in the render-blocking bundle of every route, /auth included.
// next/dynamic moves each into its own async chunk that loads after hydration.
// ssr:false is safe: all render nothing on the server today. (HelpMenu moved
// into AppTopbar's right cluster 2026-07-23 and rides its bundle now.)
const ChappiDock = dynamic(
  () => import('@/components/chappi/ChappiDock').then((m) => m.ChappiDock),
  { ssr: false }
);
const MobileNavBar = dynamic(
  () => import('@/components/app/MobileNavBar').then((m) => m.MobileNavBar),
  { ssr: false }
);
const ChappiSidePanel = dynamic(
  () => import('@/components/chappi/ChappiSidePanel').then((m) => m.ChappiSidePanel),
  { ssr: false }
);
const WorkspaceIdentityPanel = dynamic(
  () => import('@/components/app/WorkspaceIdentityPanel').then((m) => m.WorkspaceIdentityPanel),
  { ssr: false }
);
const CreateReleaseModal = dynamic(
  () => import('@/components/releases/CreateReleaseModal').then((m) => m.CreateReleaseModal),
  { ssr: false }
);
// Mounted once for the whole app so the workspace empty-state card, a note,
// and an UrgAns chip all open the same instance — the three live in different
// ownership islands, and threading a callback to each would touch a file per
// entry point. Dynamic + flag-gated, so while the planner is off its chunk is
// never requested.
const PlannerIntakeModal = dynamic(
  () => import('@/components/planner/PlannerIntakeModal').then((m) => m.PlannerIntakeModal),
  { ssr: false }
);
const WhatsNewModal = dynamic(
  () => import('@/components/app/WhatsNewModal').then((m) => m.WhatsNewModal),
  { ssr: false }
);
// The first-login push ask. Dynamic + flag-gated for the same reason the
// planner modal is: while the flag is off its chunk is never requested, and
// this one pulls in the Web Push + Capacitor push clients behind it.
const PushPermissionPrompt = dynamic(
  () => import('@/components/app/PushPermissionPrompt').then((m) => m.PushPermissionPrompt),
  { ssr: false }
);
// NOTE: the release scenes (Metadata / Calendar / Files / Press kit) are NOT
// mounted here. They were briefly overlay windows mounted app-wide from this
// file (2026-08-04), but the founder corrected that to an inline panel that
// renders in the workspace's activity slot instead — so WorkspaceView owns
// them now (see ReleaseScenePanel), and nothing app-level is involved.
const shouldLoadVercelAnalytics = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true';

// When the assistant flag is on, the UrgAns side rail rides beside <main> at
// lg+ and the floating dock takes the bottom-right corner below lg. With the
// flag off there is no launcher at all — the founder WhatsApp chat feature
// was removed outright rather than kept as a flag-off fallback.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// Bottom tab bar, below lg only — see MobileNavBar.tsx. Moves the topbar's
// nav icons + create CTA down to where a thumb reaches on a phone, and
// stands in for the ChappiDock launcher on that same range (ChappiDock
// retires itself when this is on; AppShell's dock mount line below is
// unchanged).
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

// The UrgAns planner's intake modal is mounted app-wide (see the dynamic import
// above), so a note or an assistant chip can open it without the notes page or
// the assistant page owning a copy.
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

// The workspace identity card (URG-214) — a persistent left column, mirroring
// the UrgAns rail's right column. Only meaningful once workspaces exist, so
// it's gated on both its own flag and NEXT_PUBLIC_FEATURE_WORKSPACE.
const IDENTITY_PANEL_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// Soft, dismissible prompt steering Android browser visitors toward the
// native app (docs/mobile/*.md) instead of mobile web. Shown app-wide,
// independent of auth/route state — deliberately never inside the native
// shell itself (AndroidAppBanner's own isAndroidBrowser() check excludes it).
const ANDROID_APP_BANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_ANDROID_APP_BANNER === 'true';

// First-login soft ask for notification permission (2026-08-21). Push itself
// has been live and configured since 2026-07-23; the only way in was a row in
// Settings, so an audit found ONE registered browser and ZERO devices against
// ~40 deadline notifications a day going nowhere but the in-app bell. See
// PushPermissionPrompt.tsx for why the ask is a card and why its BUTTON, not
// this mount, is what opens the OS prompt.
const PUSH_PROMPT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PUSH_PROMPT === 'true';

// Once-per-session arming for the side rail: landing on the assistant page
// (the post-auth front door when the flag is on — see lib/home-path.ts)
// opens the rail on whatever page the user navigates to next. sessionStorage,
// not localStorage, on purpose: a close should stick for the rest of the
// SESSION, then a fresh session's landing re-arms. Survives reloads (same
// tab keeps its sessionStorage), resets on a new tab/app launch.
const RAIL_ARMED_KEY = 'urganize.chappi.rail-armed';

export function AppShell({ children }: { children: ReactNode }) {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();
  const router = useRouter();
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
    pathname === '/start-trial' ||
    pathname?.startsWith('/onboarding') ||
    pathname?.startsWith('/invite');
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  // ChappiDock renders null on this exact route (the page IS the chat), so
  // the pb-28 every other dashboard page carries to clear the dock's corner
  // launcher just floats the message box mid-screen here. See the
  // .chappi-main-padding rule in globals.css.
  const isChappiRoute = pathname === '/dashboard/urgans';
  const isPreSavePublicRoute = pathname?.startsWith('/p/');
  const isOnboardingRoute = pathname?.startsWith('/onboarding');
  const isInviteRoute = pathname?.startsWith('/invite');
  const isSettingsRoute = pathname === '/settings';
  // The curator surface carries its own frame (CuratorShell) and shows none of
  // the team chrome: no topbar, no identity card, no UrgAns rail, no dock.
  const isCuratorRoute = pathname?.startsWith('/curator');
  const isPublicStandaloneRoute =
    pathname === '/' ||
    pathname?.startsWith('/credits/') ||
    pathname?.startsWith('/listen/') ||
    pathname?.startsWith('/epk/') ||
    pathname?.startsWith('/capture/') ||
    isPreSavePublicRoute ||
    isOnboardingRoute ||
    isInviteRoute ||
    isCuratorRoute;
  const hasCompletedOnboarding = user?.onboarding_completed === true;
  // Stage 2: the sidebar is gone, so the only chrome that varies between
  // "authenticated" and "still loading" is whether the WorkspaceMenu
  // monogram has the user's initial yet — and that gracefully falls back
  // to "U" when userName is empty. We collapse the two previous branches
  // (showWorkspaceSidebar / showWorkspaceSidebarSkeleton) into one.
  // Curator-ONLY: role='curator' means the team side was never switched on, so
  // there is no workspace to put chrome around. A dual account (playlist owner
  // who also runs releases) carries a team role and gets the full app — it
  // reaches its inbox through the identity card's "Playlist pitches" entry.
  const isCuratorAccount = user?.role === 'curator';
  const showWorkspaceChrome =
    (isAuthenticated || isAuthLoading) &&
    (isDashboardRoute || isSettingsRoute) &&
    !isCuratorAccount;
  const requiresArtistNameGate =
    isAuthenticated &&
    !isAuthLoading &&
    !isAuthRoute &&
    hasCompletedOnboarding &&
    user?.role === 'artist' &&
    !String(user?.artist_name || '').trim();
  const showHelpMenu =
    isAuthenticated &&
    !isAuthLoading &&
    !isAuthRoute &&
    !isPublicStandaloneRoute &&
    !requiresArtistNameGate &&
    !isCuratorAccount;

  const workspaceUserName = user?.name || user?.artist_name || user?.email || '';

  // The dock's corner launcher is what pb-28 clears; with MOBILE_NAV_ENABLED
  // the dock retires below lg and the bar itself needs clearing instead — see
  // .mobile-nav-clearance / .chappi-main-padding-nav in globals.css. Kept as
  // a precomputed value so the <main> className below stays a one-token swap.
  const mainPaddingClass = isChappiRoute
    ? MOBILE_NAV_ENABLED
      ? 'chappi-main-padding-nav'
      : 'chappi-main-padding'
    : MOBILE_NAV_ENABLED
      ? 'mobile-nav-clearance'
      : 'pb-28 md:pb-10';

  useEffect(() => {
    if (!isAuthenticated || !user) {
      void checkAuth();
    }
  }, [checkAuth, isAuthenticated, user]);

  // A curator-only account has no team, so every dashboard and settings route is a dead end
  // for them: the APIs behind those pages return 403 and the pages would render
  // permanent empty states. Send them to their own surface instead. Handled
  // here rather than per page so a stale link, a back button or an installed
  // PWA's start_url all resolve the same way.
  useEffect(() => {
    if (isAuthLoading || !isCuratorAccount) return;
    if (isDashboardRoute || isSettingsRoute) {
      router.replace(CURATOR_HOME_PATH);
    }
  }, [isAuthLoading, isCuratorAccount, isDashboardRoute, isSettingsRoute, router]);

  // Hydrate the side rail's persisted open state once per load — same
  // SSR-safe pattern as ChappiDock (first paint closed, storage read in a
  // mount effect). Runs before the arming effect below (declaration order),
  // so a landing on the assistant page wins over a persisted "closed".
  useEffect(() => {
    if (!CHAPPI_ENABLED) return;
    const persisted = readPersistedState(
      RAIL_OPEN_KEY,
      RAIL_OPEN_VERSION,
      (value): value is boolean => typeof value === 'boolean'
    );
    if (persisted !== null) {
      useChappiStore.getState().setRailOpen(persisted);
    }
  }, []);

  // Arm the rail ONCE per session, on the first chrome-bearing page the user
  // reaches: from then on, anywhere they switch to has UrgAns on the side —
  // until they close it, which sticks for the rest of the session.
  //
  // The trigger used to be the first visit to the assistant PAGE, which worked
  // only because that page was also the login landing. When the catalog became
  // the front door (2026-08-12, v0.45.1) the rail stopped opening by itself,
  // so this now fires on the dashboard and settings too — restoring the
  // pre-v0.45.1 behaviour without putting the assistant page back in front of
  // anyone. Founder call, 2026-08-12.
  //
  // Three conditions, each load-bearing:
  //  - auth must have RESOLVED (not merely be in flight): arming mid-load can
  //    fire for a session that turns out to be signed out or a curator.
  //  - a curator never gets the rail at all, so never burn their arm flag.
  //  - only routes that actually render chrome. The rail is a flex sibling of
  //    <main> on dashboard/settings; on a public page (/epk, /credits, an
  //    invite) there is nothing for it to sit beside, and arming there would
  //    spend the once-per-session flag before the user ever reaches the app.
  useEffect(() => {
    if (!CHAPPI_ENABLED) return;
    if (!isAuthenticated || isAuthLoading || isCuratorAccount) return;
    if (!isDashboardRoute && !isSettingsRoute) return;
    try {
      if (window.sessionStorage.getItem(RAIL_ARMED_KEY)) return;
      window.sessionStorage.setItem(RAIL_ARMED_KEY, '1');
    } catch {
      // Restricted storage — skip arming rather than re-open on every visit.
      return;
    }
    useChappiStore.getState().setRailOpen(true);
  }, [isAuthenticated, isAuthLoading, isCuratorAccount, isDashboardRoute, isSettingsRoute]);

  // Warm the route chunks for the app's three real destinations while the
  // browser is idle. These pages are thin server wrappers over big client
  // components, so what a prefetch actually buys is the JS chunk landing in
  // cache before the click — on a slow link that's the whole difference
  // between an instant switch and a skeleton. Once per mount, and skipped on
  // Data Saver / 2g (see lib/connection.ts). Prefetch is a no-op in dev.
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;
    // Nothing in PREFETCHED_ROUTES is reachable by a curator.
    if (isCuratorAccount) return;
    if (!shouldBackgroundPrefetch()) return;
    return runWhenIdle(() => {
      for (const route of PREFETCHED_ROUTES) {
        try {
          router.prefetch(route);
        } catch {
          // Prefetch is best-effort; a failure must never break navigation.
        }
      }
    });
  }, [isAuthLoading, isAuthenticated, isCuratorAccount, router]);

  // Register the push service worker once per load. Registration alone never
  // prompts for permission — the prompt only fires when the user explicitly
  // enables notifications in Settings (PushNotificationsSection). Having the
  // worker registered early means an already-subscribed device keeps
  // receiving pushes even before the user navigates anywhere.
  useEffect(() => {
    void registerPushServiceWorker();
  }, []);

  // Engagement drip (founder request, 2026-07-23): ping once per tab
  // session after auth resolves. The server sends the welcome push (6h
  // cooldown) and resets the user's scheduled come-back reminders — see
  // lib/engagement-server.ts. sessionStorage guard keeps route changes
  // from re-pinging.
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading || !user) return;
    // The drip's copy and deep links are all about releases and tasks, so it
    // has nothing to say to a curator.
    if (isCuratorAccount) return;
    try {
      if (window.sessionStorage.getItem('urganize.engagement.pinged')) return;
      window.sessionStorage.setItem('urganize.engagement.pinged', '1');
    } catch {
      // Restricted storage — ping anyway; the server's cooldown dedupes.
    }
    void (async () => {
      try {
        const { supabase } = await import('@/lib/supabase/client');
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        await fetch('/api/engagement/login-ping', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Best-effort — never let engagement plumbing affect the app.
      }
    })();
  }, [isAuthenticated, isAuthLoading, isCuratorAccount, user]);

  return (
    // ToastProvider wraps TaskUIProvider so any surface inside the app shell
    // (task drawer, workspace, notifications bell) can call `useToast()`.
    // Phase 3 of notifications uses it for live-arrival toasts; the same
    // provider is available for any future "save succeeded" / "upload failed"
    // moments that currently render inline toast boxes.
    <ToastProvider>
    {ANDROID_APP_BANNER_ENABLED ? (
      <ErrorBoundary name="android-app-banner" onError={reportBoundaryError}>
        <AndroidAppBanner />
      </ErrorBoundary>
    ) : null}
    {/* Reloads a tab left holding a previous deployment's chunk URLs, which
        otherwise presents as "the page scrolls but nothing is clickable"
        after a Back navigation. Renders nothing — see lib/chunk-recovery.ts. */}
    <ChunkRecoveryBridge />
    <CapacitorAuthBridge />
    <CapacitorPushBridge />
    {/* Publishes on-screen-keyboard state to CSS — see globals.css's
        keyboard-aware assistant column block. Renders nothing. */}
    <KeyboardViewportBridge />
    {/* Records every route change so back affordances (Settings' back
        button) can return to the exact previous page. */}
    <NavigationTracker />
    {/* Card-before-trial's in-session gate: the auth-store bounce only fires
        on full page loads, and both signup funnels finish with client-side
        navigations — this routes a cardTrialRequired account to /start-trial
        the moment it reaches app chrome. Renders nothing; a no-op while
        NEXT_PUBLIC_FEATURE_CARD_TRIAL is off. */}
    <CardTrialGate />
    {/* Team wall's in-session half: routes a walled team to /locked whenever
        they reach app chrome, so a trial lapsing mid-session (or a Back
        navigation off the wall) does not leave anyone working inside a walled
        team. Renders nothing; a no-op while NEXT_PUBLIC_FEATURE_HARD_PAYWALL
        is off. */}
    <HardPaywallGate />
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
          {/* app-shell-frame is a hook, not a style: it lets globals.css drop
              this floor while the on-screen keyboard is up, so the document
              cannot be scrolled by the keyboard's height into the empty band
              underneath. See the keyboard-aware block there.
              min-h-dvh, NOT min-h-screen: on mobile Safari, min-h-screen's
              static 100vh is the LARGE viewport (address bar collapsed),
              which is taller than the actual visible viewport the moment the
              address bar is showing. That mismatch alone made a "locked,
              never-scrolls" route (e.g. /dashboard/urgans, sized in dvh)
              scrollable by exactly the address bar's height — one swipe was
              enough to shift the whole page and reveal it. 100dvh tracks the
              real visible viewport instead, so there is no residual slack. */}
          <div className="app-shell-frame mx-auto flex min-h-dvh w-full max-w-[1440px] flex-col">
            {/* Trial indicator, above the topbar rather than in it: the
                topbar's right cluster has a documented width budget that
                already overflows a 375px phone, so a countdown there would
                break phones. Renders nothing outside the last stretch of a
                trial, and nothing at all while the flag is off. */}
            <TeamTrialStrip />
            <TeamReadOnlyStrip />
            {/* Assistant-usage indicator, same slot and same contract.
                Renders only for a team inside the last fifth of its monthly
                UrgAns actions, which today is nobody: no code path can write
                the capped tier yet. */}
            <UrgansUsageStrip />
            <AppTopbar onNewRelease={openCreateRelease} userName={workspaceUserName} />
            {/* <main> + the UrgAns side rail share a flex row so the rail is
                a layout-flow column (content narrows; nothing is covered) on
                every chrome page. The rail renders nowhere on the assistant
                page itself — that page IS the chat. */}
            {/* The two side columns are wrapped because they are OUTSIDE
                app/error.tsx's reach — it renders inside this layout, so a throw
                out here escapes to global-error.tsx and takes the whole app with
                it. Neither column is load-bearing: if one breaks, it goes quiet
                and the workspace keeps working. ErrorBoundary adds no DOM node,
                which matters here — these are flex children of this row. */}
            <div className="flex min-h-0 flex-1">
              {IDENTITY_PANEL_ENABLED ? (
                <ErrorBoundary name="identity-panel" onError={reportBoundaryError}>
                  <WorkspaceIdentityPanel />
                </ErrorBoundary>
              ) : null}
              <main className={`min-w-0 flex-1 px-4 pt-5 sm:px-5 md:px-6 lg:px-8 ${mainPaddingClass}`}>
                {children}
              </main>
              {CHAPPI_ENABLED && !isChappiRoute ? (
                <ErrorBoundary name="urgans-rail" onError={reportBoundaryError}>
                  <ChappiSidePanel onNewRelease={openCreateRelease} />
                </ErrorBoundary>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="app-layout lazy-fade lazy-fade-in">{children}</div>
      )}
      {/* HelpMenu moved into AppTopbar's right cluster (2026-07-23). */}
      {/* Same reasoning as the side columns above: losing the dock silently is
          a real cost — but strictly less than losing the entire application
          because a floating widget threw. */}
      {showHelpMenu && CHAPPI_ENABLED ? (
        <ErrorBoundary name="support-launcher" onError={reportBoundaryError}>
          <ChappiDock onNewRelease={openCreateRelease} />
        </ErrorBoundary>
      ) : null}
      {MOBILE_NAV_ENABLED && showWorkspaceChrome && !requiresArtistNameGate ? (
        <MobileNavBar onNewRelease={openCreateRelease} />
      ) : null}
      <CreateReleaseModal
        open={isCreateReleaseOpen}
        onClose={closeCreateRelease}
        onCreated={(releaseId, _plan, result) => {
          // Stay on whatever page the user was on (no forced redirect); just
          // close and refresh the release store so the new release shows up.
          // loadCommandCenter refreshes quietly when data already exists.
          closeCreateRelease();
          void useReleaseStore.getState().loadCommandCenter();
          // One exception to "stay put": a rollout-plan creation continues
          // straight into the planner intake (mounted right below), the same
          // settled call the workspace's create flow makes — planning is the
          // whole point of having chosen a rollout plan. No navigation here:
          // dismissing the intake leaves the user where they were, and
          // submitting it navigates to the plan scene itself. The type picked
          // in the modal rides along so the intake doesn't ask it again.
          if (PLANNER_ENABLED && result?.plannerPending) {
            usePlannerStore.getState().openIntake({
              source: 'empty_state',
              releaseId,
              ...(result.releaseType
                ? { prefill: { releaseType: result.releaseType } }
                : {}),
            });
          }
        }}
      />
      {PLANNER_ENABLED && isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (
        <PlannerIntakeModal />
      ) : null}
      {/* "What's new" (founder request, 2026-07-23): announces changelog
          entries this device hasn't seen yet, once per release, on signed-in
          app surfaces only. */}
      {isAuthenticated && !isAuthLoading && showWorkspaceChrome ? <WhatsNewModal /> : null}
      {/* Same gate as What's new: signed in, auth RESOLVED, and only on a
          route that renders chrome. showWorkspaceChrome already excludes a
          curator-only account, which has no releases or tasks to be notified
          about. */}
      {PUSH_PROMPT_ENABLED && isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (
        <PushPermissionPrompt />
      ) : null}
      {shouldLoadVercelAnalytics ? <Analytics /> : null}
      {/* FirstTimeOnboardingGate was mounted here until 2026-07-29 (URG-191).
          It was a SECOND, legacy onboarding implementation — a 5-step
          full-screen dashboard takeover that predated the current /onboarding
          route and never got the 0.16/0.21 visual passes. It fired for any
          profile with onboarding_completed !== true, which meant every path
          into the app that wasn't /onboarding (invite acceptance above all)
          hit a stale, unskippable wizard. /onboarding is the only onboarding
          flow now; restore from git history if a post-signup overlay is ever
          wanted again. */}
    </TaskUIProvider>
    </ToastProvider>
  );
}
