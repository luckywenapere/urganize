'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { useAuthStore } from '@/lib/auth-store';
import { useShellStore } from '@/stores/useShellStore';
import { ArtistNameGate } from '@/components/ArtistNameGate';
import { ErrorBoundary } from '@/components/app/ErrorBoundary';
import { reportBoundaryError } from '@/lib/report-boundary-error';
import { installLinkStallWatchdog } from '@/lib/nav-stall-watch';
import { TaskUIProvider } from '@/components/tasks/TaskUIProvider';
import { NavigationTracker } from '@/components/app/NavigationTracker';
import { AccountPhotoSync } from '@/components/shared/AccountPhoto';
import { PresenceBeacon } from '@/components/app/PresenceBeacon';
import { ToastProvider } from '@/components/shared/ToastProvider';
import { buildCreatedRolloutIntake } from '@/lib/release-draft-discard';
import { ChunkRecoveryBridge } from '@/components/providers/ChunkRecoveryBridge';
import { CardTrialGate } from '@/components/providers/CardTrialGate';
import { AddCardGate } from '@/components/providers/AddCardGate';
import { HardPaywallGate } from '@/components/providers/HardPaywallGate';
import { NativePushBridge } from '@/components/providers/NativePushBridge';
import { NativeShareBridge } from '@/components/providers/NativeShareBridge';
import { NativeAppearanceBridge } from '@/components/providers/NativeAppearanceBridge';
import { KeyboardViewportBridge } from '@/components/providers/KeyboardViewportBridge';
import { isChappiHistoryEnabled } from '@/lib/chappi/history-flag';
import { warmChappiHistory } from '@/lib/chappi/history-warm';
import { precacheRoutesOffline, registerAppServiceWorker } from '@/lib/offline/register';
import { runWhenIdle, shouldBackgroundPrefetch } from '@/lib/connection';
import { buildPrefetchRoutes } from '@/lib/prefetch-routes';
import { CURATOR_HOME_PATH } from '@/lib/home-path';
import { isSocialShareEnabled } from '@/lib/social-share-flag';
import { isRolloutIdeasEnabled } from '@/lib/rollout-ideas';
import { isChappiEnabled, isUrgansRealtimeEnabled } from '@/lib/chappi/config';

const TALK_ENABLED = isChappiEnabled() && isUrgansRealtimeEnabled();

// The release and planner stores, and the first-rollout share offer, are only
// touched after something happens (a create, a reconnect), never for first
// paint. Imported on demand (URG-314 batch 6) so they, and the task and scene
// stores the release store pulls in, stay out of every route's first load.
// A chunk that fails to load is the same as a refresh that did not happen.
function refreshCatalog(options?: { force?: boolean }) {
  void import('@/stores/useReleaseStore')
    .then(({ useReleaseStore }) => useReleaseStore.getState().loadCommandCenter(options))
    .catch(() => undefined);
}

// The prefetch list moved to lib/prefetch-routes.ts (2026-08-31) so it can be
// flag- and account-aware and unit-tested. It used to be three hardcoded
// entries here, which had drifted: the identity card and the mobile bar had
// since grown Notes, Shows and the curator crossing, so three primary
// destinations were cold on every load. The "deliberately short" principle
// still holds and is argued in that module — it is every destination the nav
// offers, not the whole app.

// None of these are needed for first paint — the onboarding wizard, the
// create-release modal, and the floating support widgets used to be
// static imports, which shipped their code (the ~1,000-line onboarding flow
// included) in the render-blocking bundle of every route, /auth included.
// next/dynamic moves each into its own async chunk that loads after hydration.
// ssr:false is safe: all render nothing on the server today. (HelpMenu moved
// into the top bar's right cluster 2026-07-23; since 2026-10-14 its rows are
// in the account menu, useHelpMenuGroups.)
// The workspace chrome (top bar, side menu, bottom bar, the search bar and the
// floating UrgAns launcher) lives in components/app/WorkspaceFrame.tsx, mounted
// by the /dashboard and /settings route layouts (URG-314 batch 7), so none of
// it rides in /auth's or a public page's first load.
// The invite gate only ever opens after its own /api answer arrives, on a
// signed-in dashboard page, so its code (and the next-moves engine behind it)
// does not need to ride in every route's first load (URG-314, 2026-10-16).
const InviteGate = dynamic(
  () => import('@/components/app/InviteGate').then((m) => m.InviteGate),
  { ssr: false }
);
// The trial sheet after onboarding's first music (#854). Loaded on its own so
// app pages that never need it do not carry its code up front.
const OnboardingTrialSheetHost = dynamic(
  () => import('@/components/onboarding/OnboardingTrialSheet').then((m) => m.OnboardingTrialSheetHost),
  { ssr: false }
);

const PlanChoiceHost = dynamic(
  () => import('@/components/releases/PlanChoiceDialog').then((m) => m.PlanChoiceHost),
  { ssr: false }
);
// The Add an artist sheet (#882), opened by the Artists tab's + and the artist page.
const AddArtistHost = dynamic(
  () => import('@/components/artists/AddArtistDialog').then((m) => m.AddArtistHost),
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
// Report a bug or a request. Mounted once for the same reason the planner
// intake is: its entry points (the account menu's help rows, and a section in
// Settings → Account) live in different ownership islands, so they open it
// through useReportIssueStore rather than each owning an instance.
const ReportIssueDialog = dynamic(
  () => import('@/components/support/ReportIssueDialog').then((m) => m.ReportIssueDialog),
  { ssr: false }
);
// "Get help" (self-serve checkout, 2026-10-22), opened from the same help rows.
const HelpDialog = dynamic(
  () => import('@/components/support/HelpDialog').then((m) => m.HelpDialog),
  { ssr: false }
);
// The settings pop-up (2026-09-29). Mounted once for the whole app because its
// entry points (the topbar, the identity card, the workspace menu, and links from
// the share sheet, the directory and UrgAns) live in different ownership islands,
// and it opens from the URL (`?settings=`), so they all just navigate. Lazy, so
// nobody downloads the nine segments until somebody opens it.
// Talk to UrgAns (2026-10-11, NEXT_PUBLIC_FEATURE_URGANS_REALTIME). Mounted
// once so a call outlives the composer it was started from and survives moving
// between pages. Lazy and flag-gated: with the flag off its chunk is never asked for.
const VoiceSheetHost = dynamic(
  () => import('@/components/chappi/voice/VoiceSheetHost').then((m) => m.VoiceSheetHost),
  { ssr: false }
);
const SettingsModalHost = dynamic(
  () => import('@/components/settings/SettingsModal').then((m) => m.SettingsModalHost),
  { ssr: false }
);
// The first-login push ask. Dynamic + flag-gated for the same reason the
// planner modal is: while the flag is off its chunk is never requested, and
// this one pulls in the Web Push + native push clients behind it.
// Self-serve checkout (2026-10-22): the "Upgrade to Manager" sheet a Solo
// limit opens (lib/access-redirect.ts announces it). Client-only, tiny.
const SoloLimitSheet = dynamic(
  () => import('@/components/billing/SoloLimitSheet').then((m) => m.SoloLimitSheet),
  { ssr: false }
);
const PushPermissionPrompt = dynamic(
  () => import('@/components/app/PushPermissionPrompt').then((m) => m.PushPermissionPrompt),
  { ssr: false }
);
// The install offer that precedes it. Same dynamic + flag-gated treatment,
// and it must stay client-only: every branch it takes depends on reading the
// user agent, the display mode, and whether the browser has offered us an
// install of its own.
const TourOverlay = dynamic(
  () => import('@/components/tours/TourOverlay').then((m) => m.TourOverlay),
  { ssr: false }
);

// Share to socials (2026-09-23). Mounted once for the whole app for the
// planner intake's reason: it opens from the rollout's Share button, UrgAns and
// the once-only first-rollout offer on Home, which live in different ownership
// islands. Lazy and
// flag-gated, so with the flag off its chunk is never requested.
const AiConsentSheet = dynamic(
  () => import('@/components/ai/AiConsentSheet').then((m) => m.AiConsentSheet),
  { ssr: false }
);
const ShareSheet = dynamic(
  () => import('@/components/share/ShareSheet').then((m) => m.ShareSheet),
  { ssr: false }
);
// NOTE: the release scenes (Metadata / Calendar / Files / Press kit) are NOT
// mounted here. They were briefly overlay windows mounted app-wide from this
// file (2026-08-04), but the founder corrected that to an inline panel that
// renders in the workspace's activity slot instead — so WorkspaceView owns
// them now (see ReleaseScenePanel), and nothing app-level is involved.
const shouldLoadVercelAnalytics = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true';

// Saved UrgAns chats (NEXT_PUBLIC_FEATURE_URGANS_HISTORY, meaningful only with
// the assistant flag). The bridge that saves and restores chats lives in the
// workspace layout (WorkspaceFrame); here it only gates warming the two
// history requests right after sign-in (lib/chappi/history-warm.ts), so Home
// opens on the last chat without loading the history store on /auth.
const CHAT_HISTORY_ENABLED = isChappiHistoryEnabled();

// In-app issue reporting. Gates the dialog here and the two entry points that
// open it; the API route checks the same flag itself, so a direct call cannot
// reach the feature while the UI is dark.
const REPORT_ISSUE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_REPORT_ISSUE === 'true';

// The UrgAns planner's intake modal is mounted app-wide (see the dynamic import
// above), so a note or an assistant chip can open it without the notes page or
// the assistant page owning a copy.
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

// Type-first create (founder call, 2026-09-01): tapping the type IS the
// create, and the new release view is where the rest gets filled in — so this
// instance's deliberate "stay on whatever page" behavior gives way to landing
// in the release, for the flag-on path only.
const TYPE_FIRST_CREATE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE === 'true';


// First-login soft ask for notification permission (2026-08-21). Push itself
// has been live and configured since 2026-07-23; the only way in was a row in
// Settings, so an audit found ONE registered browser and ZERO devices against
// ~40 deadline notifications a day going nowhere but the in-app bell. See
// PushPermissionPrompt.tsx for why the ask is a card and why its BUTTON, not
// this mount, is what opens the OS prompt.
const PUSH_PROMPT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PUSH_PROMPT === 'true';
const OFFLINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_OFFLINE === 'true';

const TOURS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TOURS === 'true';
const SOCIAL_SHARE_ENABLED = isSocialShareEnabled();

export function AppShell({ children }: { children: ReactNode }) {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAuthLoading = useAuthStore((state) => state.isLoading);
  const user = useAuthStore((state) => state.user);
  const pathname = usePathname();
  const historyWarmUserId = useAuthStore((state) =>
    CHAT_HISTORY_ENABLED && state.isAuthenticated && state.user && state.user.role !== 'curator' ? state.user.id : null
  );
  useEffect(() => {
    if (historyWarmUserId) warmChappiHistory(historyWarmUserId);
  }, [historyWarmUserId]);
  const router = useRouter();
  // Lifted here so the universal topbar "New rollout" button opens the same
  // creation modal the page-level buttons use, from any dashboard page,
  // without navigating away.
  const isCreateReleaseOpen = useShellStore((state) => state.createOpen);
  const closeCreateRelease = useShellStore((state) => state.closeCreate);
  const createPlan = useShellStore((state) => state.createPlan);
  const createArtistId = useShellStore((state) => state.createArtistId);
  const createOrigin = useShellStore((state) => state.createOrigin);

  const isAuthRoute =
    pathname?.startsWith('/auth') ||
    pathname === '/locked' ||
    // UrgAns for a team behind the wall (app/locked/urgans): no help menu, and
    // the artist-name gate must not intercept a page whose job is to keep
    // working on credits.
    pathname?.startsWith('/locked/') ||
    pathname === '/start-trial' ||
    // Card trial for customers abroad (#1266): the add-a-card page.
    pathname === '/add-card' ||
    // Self-serve checkout and its welcome page (2026-10-22): a held account
    // pays here, so no app chrome and no gates.
    pathname?.startsWith('/checkout') ||
    pathname?.startsWith('/onboarding') ||
    pathname?.startsWith('/invite');
  const isDashboardRoute = pathname?.startsWith('/dashboard');
  const isPreSavePublicRoute = pathname?.startsWith('/p/');
  const isOnboardingRoute = pathname?.startsWith('/onboarding');
  const isInviteRoute = pathname?.startsWith('/invite');
  const isSettingsRoute = pathname === '/settings';
  // The curator surface carries its own frame (CuratorShell) and shows none of
  // the team chrome: no topbar, no identity card, no UrgAns rail, no dock.
  const isCuratorRoute = pathname?.startsWith('/curator');
  const isPublicStandaloneRoute =
    pathname === '/' ||
    // The sign-in page (#1053): its two-column hero and footer are measured to
    // the window edge, so the signed-in gutter would push them off true.
    pathname === '/auth' ||
    // The unsubscribe link in an email, opened by someone who may not be signed in.
    pathname === '/unsubscribe' ||
    pathname?.startsWith('/credits/') ||
    pathname?.startsWith('/listen/') ||
    pathname?.startsWith('/epk/') ||
    // A standing press kit, opened by an editor who has no account.
    pathname?.startsWith('/k/') ||
    // A person's public record, opened by a manager deciding who to hire.
    pathname?.startsWith('/p/') ||
    // A claim link, opened by a credited person who may have no account yet.
    // The page runs its own sign-in and confirm steps.
    pathname?.startsWith('/claim/') ||
    // A manager Wena invited, opening the link to a profile built with them.
    pathname?.startsWith('/welcome/') ||
    pathname?.startsWith('/capture/') ||
    // A curator's public page, opened by an artist who has no account yet and
    // is deciding whether to make one. Chrome here would be the product
    // talking over the person whose page it is.
    pathname?.startsWith('/pitch/') ||
    // An old DJ pack link, opened by someone with no account at all. The page
    // was deleted (Oct 17, 2026); its not-found screen stays chrome-free.
    pathname?.startsWith('/pack/') ||
    // A rollout brief's view link (URG-281), opened by someone with no account.
    pathname?.startsWith('/brief/') ||
    // Self-serve checkout: someone paying for a plan, often not let in yet.
    pathname?.startsWith('/checkout') ||
    // The OAuth consent screen. Signed-in, but it is a decision about handing a
    // third-party client access — app chrome around it would invite the user to
    // wander off mid-authorization, and the dock floating over a consent prompt
    // is exactly the wrong furniture. Same treatment as /epk/.
    pathname?.startsWith('/oauth/') ||
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
  // Tri-state (null = the probe has not answered). Used only to decide whether
  // to warm the /curator crossing — see lib/prefetch-routes, which treats null
  // as "not yet" rather than "no".
  const hasCuratorProfile = useAuthStore((state) => state.hasCuratorProfile);
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

  useEffect(() => {
    if (!isAuthenticated || !user) {
      void checkAuth();
    }
  }, [checkAuth, isAuthenticated, user]);

  // If a tap on any ordinary link has not changed the page after a few seconds,
  // load the destination the ordinary way instead of leaving the app frozen.
  // Real users hit links and buttons that did nothing until they reloaded; see
  // lib/nav-stall.ts. Installed once for the whole shell.
  useEffect(() => installLinkStallWatchdog(), []);

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

  // Warm the route chunks for every destination the nav offers while the
  // browser is idle, so a tap is instant instead of a skeleton. Skipped on
  // Data Saver / 2g (see lib/connection.ts), and a no-op in dev.
  //
  // Which routes, and why not all of them, is argued in lib/prefetch-routes.
  //
  // Re-runs when hasCuratorProfile resolves, which is the point of having it
  // in the deps: a dual account's /curator crossing is unknown on first paint
  // and gets warmed once the probe answers. Safe to re-run because
  // router.prefetch is idempotent — an already-cached route costs nothing.
  useEffect(() => {
    if (!isAuthenticated || isAuthLoading) return;
    // A curator-only account reaches none of these; it has its own shell.
    if (isCuratorAccount) return;
    if (!shouldBackgroundPrefetch()) return;
    return runWhenIdle(() => {
      const routes = buildPrefetchRoutes({ hasCuratorProfile });
      for (const route of routes) {
        try {
          router.prefetch(route);
        } catch {
          // Prefetch is best-effort; a failure must never break navigation.
        }
      }
      // With the offline layer on, also keep each page on the device so the
      // whole nav still opens with no connection.
      void precacheRoutesOffline(routes);
    });
  }, [hasCuratorProfile, isAuthLoading, isAuthenticated, isCuratorAccount, router]);

  // Register the app's service worker once per load — push-only (sw.js) or
  // the offline shell (sw-offline.js), decided by registerAppServiceWorker
  // itself. Registration alone never prompts for push permission — that
  // prompt only fires when the user explicitly enables notifications in
  // Settings (PushNotificationsSection). Having the worker registered early
  // means an already-subscribed device keeps receiving pushes even before
  // the user navigates anywhere, and (when the offline flag is on) the
  // offline shell is ready before the connection ever drops.
  useEffect(() => {
    void registerAppServiceWorker();
  }, []);

  // Reconnect: replay whatever queued offline while the connection was
  // down, THEN re-pull the catalog rather than waiting for the next
  // natural trigger (a click, the 10s freshness window). flushOfflineQueue
  // coalesces concurrent calls and loadCommandCenter has its own in-flight
  // dedup and recency window, so this never doubles up with an
  // already-running or already-fresh load. Also runs once on mount — a
  // page reload can leave items queued from before the reload, and they
  // should not have to wait for a fresh online/offline transition to sync.
  useEffect(() => {
    if (!OFFLINE_ENABLED) return;
    // Imported on demand (URG-314): the queue and the stores it replays into
    // are not needed for first paint, so they stay out of every route's first
    // load. A chunk that fails to load is the same as an empty queue here.
    const syncNow = () => {
      void import('@/lib/offline/sync')
        .then(({ flushOfflineQueue }) => flushOfflineQueue())
        .catch(() => undefined)
        .finally(() => {
          refreshCatalog({ force: true });
        });
    };
    syncNow();
    window.addEventListener('online', syncNow);
    return () => window.removeEventListener('online', syncNow);
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
    {/* Reloads a tab left holding a previous deployment's chunk URLs, which
        otherwise presents as "the page scrolls but nothing is clickable"
        after a Back navigation. Renders nothing — see lib/chunk-recovery.ts. */}
    <ChunkRecoveryBridge />
    <NativePushBridge />
    <NativeShareBridge />
    <NativeAppearanceBridge />
    {/* Publishes on-screen-keyboard state to CSS — see globals.css's
        keyboard-aware assistant column block. Renders nothing. */}
    <KeyboardViewportBridge />
    {/* Records every route change so back affordances (Settings' back
        button) can return to the exact previous page. */}
    <NavigationTracker />
    {/* The "last seen" ping behind /admin/metrics' online-now and active-people
        counts. Signed-in users only; renders nothing. */}
    <PresenceBeacon />
    {/* Your account photo (NEXT_PUBLIC_FEATURE_PROFILE_PHOTO): fetched on
        sign-in and on focus; renders nothing, inert with the flag off. */}
    <AccountPhotoSync />
    {/* Card-before-trial's in-session gate: the auth-store bounce only fires
        on full page loads, and both signup funnels finish with client-side
        navigations — this routes a cardTrialRequired account to /start-trial
        the moment it reaches app chrome. Renders nothing; a no-op while
        NEXT_PUBLIC_FEATURE_CARD_TRIAL is off. */}
    <CardTrialGate />
    {/* Card trial for customers abroad (#1266): sends a new owner outside
        Nigeria to /add-card until a card is in. Renders nothing, and does
        nothing until Bachs has card trials on for us. */}
    <AddCardGate />
    {/* Team wall's in-session half: routes a walled team to /locked whenever
        they reach app chrome, so a trial lapsing mid-session (or a Back
        navigation off the wall) does not leave anyone working inside a walled
        team. Renders nothing; a no-op while NEXT_PUBLIC_FEATURE_HARD_PAYWALL
        is off. */}
    <HardPaywallGate />
    {/* The invite gate (founder request, 2026-10-11): once a new manager
        scrolls their first plan, the app freezes until one teammate is
        invited. Only on app chrome, never on auth, onboarding or public pages.
        Suspense because it reads the search params. See lib/invite-gate.ts. */}
    {isAuthenticated && (isDashboardRoute || isSettingsRoute) ? (
      <ErrorBoundary name="invite-gate" onError={reportBoundaryError}>
        <Suspense fallback={null}>
          <InviteGate />
        </Suspense>
      </ErrorBoundary>
    ) : null}
    <TaskUIProvider>
      {requiresArtistNameGate ? (
        <ArtistNameGate />
      ) : isDashboardRoute || isSettingsRoute ? (
        // The workspace chrome (top bar, side menu, page bar, bottom bar,
        // search bar, UrgAns launcher) is mounted by the /dashboard and
        // /settings route layouts (components/app/WorkspaceFrame.tsx), so its
        // code ships only with those routes (URG-314 batch 7). The frame
        // applies the same signed-in / curator rules showWorkspaceChrome does.
        children
      ) : (
        // A public token page renders full bleed. `.app-layout` carries a
        // horizontal gutter at lg+, which is chrome padding for an
        // AUTHENTICATED page and has no business around a press kit, a DJ
        // pack, a credits form or a capture page: all four are dark locked
        // artifacts with their own background, so the gutter showed the
        // viewer's own body colour as a border around them. On a light theme
        // desktop that is a cream frame around an ink page, on the one surface
        // an editor judges the artist by. Found 2026-09-05 by rendering the
        // press kit; it affected all four and had done since each shipped.
        <div
          className={`app-layout lazy-fade lazy-fade-in${
            isPublicStandaloneRoute ? ' app-layout-full-bleed' : ''
          }`}
        >
          {children}
        </div>
      )}
      {/* Gated on the same showHelpMenu the account menu's help rows use —
          signed in, not mid-auth, not on a public page, not a curator. It
          opens from those rows and from Settings, both inside that same set. */}
      {REPORT_ISSUE_ENABLED && showHelpMenu ? <ReportIssueDialog /> : null}
      {showHelpMenu ? <HelpDialog /> : null}
      {/* Deliberately NO onStartTestRelease on this instance, unlike the two
          the first-release prompt opens (WorkspaceView, ChappiPageClient).
          Two reasons: this modal only opens from deliberate "+ New rollout"
          taps, not from the prompt the test path serves; and AppShell cannot
          consume the ToastProvider it mounts itself, so a failed test-release
          create here would have NO surface at all — a silent dead tap, the
          one outcome the test path must never produce. */}
      <CreateReleaseModal
        open={isCreateReleaseOpen}
        onClose={closeCreateRelease}
        initialPlan={createPlan}
        initialArtistId={createArtistId}
        origin={createOrigin}
        onCreated={(releaseId, _plan, result) => {
          // Stay on whatever page the user was on (no forced redirect); just
          // close and refresh the release store so the new release shows up.
          // loadCommandCenter refreshes quietly when data already exists.
          closeCreateRelease();
          refreshCatalog();
          // Share to socials (2026-09-23): a first rollout's share offer is
          // saved for the next visit, and the rest runs straight away. See
          // withFirstShareOffer; the same two steps, with the helper loaded on
          // demand (URG-314 batch 6). Saving the offer never throws and
          // nothing below waits on it.
          void import('@/components/share/withFirstShareOffer')
            .then(({ deferFirstShareOffer }) =>
              deferFirstShareOffer(releaseId, result?.firstRelease)
            )
            .catch(() => undefined);
          // One exception to "stay put": a rollout-plan creation continues
          // straight into the planner intake (mounted right below), the
          // same settled call the workspace's create flow makes — planning
          // is the whole point of having chosen a rollout plan. No
          // navigation here: dismissing the intake leaves the user where
          // they were, and submitting it navigates to the plan scene
          // itself. The type picked in the modal rides along so the intake
          // doesn't ask it again. Closing the intake early discards the
          // rollout made just now while it is still an untouched shell,
          // exactly as the Home/workspace create paths do (v1.92.1).
          if (PLANNER_ENABLED && result?.plannerPending && !isRolloutIdeasEnabled()) {
            void import('@/stores/usePlannerStore')
              .then(({ usePlannerStore }) =>
                usePlannerStore.getState().openIntake(
                  buildCreatedRolloutIntake({
                    releaseId,
                    savedTitle: result.savedTitle,
                    releaseType: result.releaseType,
                  })
                )
              )
              .catch(() => undefined);
          } else if (TYPE_FIRST_CREATE_ENABLED || (PLANNER_ENABLED && result?.plannerPending)) {
            // TYPE-FIRST CREATE (2026-09-01): the one create screen was the whole
            // form, so the release view — where name and date get
            // prompted — is the destination, wherever the modal was opened
            // from. Flag off, the stay-put behavior above is unchanged.
            router.push(`/dashboard?release=${releaseId}`);
          }
        }}
      />
      {PLANNER_ENABLED && isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (
        <PlannerIntakeModal />
      ) : null}
      {/* AI permission (Apple 5.1.2(i)). Mounted for every signed-in page so a
          server refusal on any screen can open it; the component renders
          nothing unless the feature is on and something asked. */}
      {isAuthenticated && !isAuthLoading ? <AiConsentSheet /> : null}
      {/* Share to socials. Same gate as the intake above: a rollout to share
          only exists for a signed-in team, on a page with app chrome, and
          showWorkspaceChrome already excludes a curator-only account. */}
      {SOCIAL_SHARE_ENABLED && isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (
        <ShareSheet />
      ) : null}
      {/* Settings. Same gate as the share sheet: signed in, auth resolved, on a
          page with app chrome. showWorkspaceChrome already excludes a
          curator-only account, whose settings live under /curator. */}
      {isAuthenticated && !isAuthLoading && showWorkspaceChrome ? <SettingsModalHost /> : null}
      {TALK_ENABLED && isAuthenticated && !isAuthLoading && showWorkspaceChrome ? <VoiceSheetHost /> : null}
      {isAuthenticated && !isAuthLoading ? <SoloLimitSheet /> : null}
      {/* "What's new" (founder request, 2026-07-23): announces changelog
          entries this device hasn't seen yet, once per release, on signed-in
          app surfaces only.
          TEMPORARILY DISABLED (founder request, 2026-08-27) — the `false &&`
          below is the whole switch. Nothing else about the feature changed:
          WhatsNewModal, the changelog ledger, and each device's seen-version
          are untouched, so removing `false &&` turns it straight back on and
          picks up wherever it left off. */}
      {false && isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (
        <WhatsNewModal />
      ) : null}
      {/* Same gate as What's new: signed in, auth RESOLVED, and only on a
          route that renders chrome. showWorkspaceChrome already excludes a
          curator-only account, which has no releases or tasks to be notified
          about. */}
      {PUSH_PROMPT_ENABLED && isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (
        <PushPermissionPrompt />
      ) : null}
      {/* The guided tour (lib/tours.ts), offered after a plan is approved.
          Same gate again — a tour points at app chrome, so there has to be
          app chrome. It renders nothing until something calls
          useTourStore.start, so mounting it costs a subscribed selector and no
          markup. */}
      {TOURS_ENABLED && isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (
        <TourOverlay />
      ) : null}
      {/* The plan choice a rollout offer opens (Home's "Got a release
          coming?", a page's "Plan a rollout"). Renders nothing until one asks.
          It replaced the first-rollout focus (2026-10-24), which locked every
          other area until a rollout existed; see lib/rollout-offer.ts. */}
      {isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (
        <>
          <PlanChoiceHost />
          <AddArtistHost />
        </>
      ) : null}
      {/* "Your 3-day trial is on" (#854): once, after the first music, never
          over the planner's questions. Renders nothing until its moment. */}
      {isAuthenticated && !isAuthLoading && showWorkspaceChrome ? (
        <ErrorBoundary name="onboarding-trial-sheet" onError={reportBoundaryError}>
          <OnboardingTrialSheetHost />
        </ErrorBoundary>
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
