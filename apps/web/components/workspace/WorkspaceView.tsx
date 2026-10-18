'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AlertCircle } from '@/components/icons';
import { RolloutPhoneHeader } from './RolloutPhoneHeader';
import { useRolloutPhoneChrome } from '@/stores/useRolloutPhoneChrome';
import { useAuthStore } from '@/lib/auth-store';
import { isCatalogRequested, markCatalogRequested } from '@/lib/catalog-intent';
import { watchNavigationStall } from '@/lib/nav-stall-watch';
import { isTestReleaseEnabled, readTestRelease } from '@/lib/test-release';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { type Task } from '@/lib/tasks';
import { toastDismissMs } from '@/lib/toast-timing';
import type { Release } from '@/types/releases';
import { Toast } from '@/components/shared/Toast';
import { NewReleaseGuide } from '@/components/releases/NewReleaseGuide';
import { ReleaseAccessStep } from '@/components/releases/ReleaseAccessStep';
import { SetReleaseDateCard } from '@/components/releases/SetReleaseDateCard';
import { WorkspaceSkeleton } from '@/components/loading/WorkspaceSkeleton';
import { FirstReleaseWin } from './FirstReleaseWin';
import { useFirstReleasePrompt } from '@/components/releases/useFirstReleasePrompt';
import { useStartTestRelease } from '@/components/releases/useStartTestRelease';
import { TestReleaseBanner } from './TestReleaseBanner';
import { EditorialPitchClosedBanner } from './EditorialPitchClosedBanner';
import { DistributionStatusStrip } from './DistributionStatusStrip';
import { RolloutFirstSteps, useRolloutFirstSteps } from './RolloutFirstSteps';
import { RolloutNextMoves } from '@/components/next-moves/RolloutNextMoves';
import { requestEditorialPitchBackfill } from '@/lib/editorial-pitch-client';
import { daysToRelease, isEditorialPitchTask, pitchWindowState } from '@/lib/editorial-pitch';
import { DeleteReleaseDialog } from './DeleteReleaseDialog';
import type { ReleaseCardData } from './catalogue-types';
import { CatalogueView } from './CatalogueView';
import { displayStatus, pickNextTask, type CatalogueRow } from '@/lib/catalogue-table';
import { distributionStripMode } from '@/lib/distribution-strip-visibility';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { TasksPanel } from './TasksPanel';
import { useSceneOverlay } from './useSceneOverlay';
import { resolveActiveScene, resolvePanelBody } from '@/lib/scene-cache';
import { useScenePrefetch } from './useScenePrefetch';
import { useIsDesktopViewport } from './useIsDesktopViewport';
import { runWhenIdle, shouldBackgroundPrefetch } from '@/lib/connection';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { TimelineFullScreen } from '@/components/releases/TimelineFullScreen';
import { WorkspaceDesktopFocused } from './WorkspaceDesktopFocused';
import { useReleaseScope } from './useReleaseScope';
import { useReleaseSetupPrompt } from './useReleaseSetupPrompt';
import { scopedRolloutIntakePrefill } from '@/lib/planner-intake-steps';
import {
  readFirstSessionRecord,
  takeOnboardingPlannerHandoff,
} from '@/lib/first-session';
import { findPinnedConfirmDateTask } from '@/lib/pinned-confirm-date';
import { PinnedConfirmDateCard } from './PinnedConfirmDateCard';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { buildCreatedRolloutIntake } from '@/lib/release-draft-discard';
import { PlanReleaseCard } from '@/components/planner/PlanReleaseCard';
import { AutoPlanCard } from '@/components/planner/AutoPlanCard';
import { useAutoPlan } from '@/components/planner/useAutoPlan';
import { readPlannerAuto } from '@/lib/planner-auto';
import { usePlanBuiltSeen } from '@/components/planner/usePlanBuiltSeen';
import { readPlannedByUrgans } from '@/lib/release-planned-by-urgans';
import { UrgansLockedSheet } from '@/components/urgans-actions/UrgansLockedSheet';
import { ArchiveReleaseDialog } from '@/components/workspace/ArchiveReleaseDialog';
import { ChangeReleaseArtistDialog } from '@/components/workspace/ChangeReleaseArtistDialog';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { isReleaseActive } from '@/lib/release-activity';
import { isRecapEligible as isRecapEligibleForRelease } from '@/lib/recap-eligibility';
import { onlyPreProductionWork } from '@/lib/pre-production';
import { isReviewDue } from '@/lib/release-review';
import { ReleaseReview } from '@/components/between-releases/ReleaseReview';
import { findRoleGaps } from '@/lib/role-gaps';
import { RoleGapsPanel } from '@/components/directory/RoleGapsPanel';
import { SentRequestsList } from '@/components/directory/SentRequestsList';
import { withFirstShareOffer } from '@/components/share/withFirstShareOffer';
import { isSocialShareEnabled } from '@/lib/social-share';
import { useShareStore } from '@/stores/useShareStore';

const TASKS_PANEL_ID = 'workspace-tasks';

// Feature flag — when 'true', a new user's FIRST release creation triggers the
// "first win" reveal (URG-107) instead of navigating straight to the release.
// Inlined at build time. Off in prod until validated.
const FIRST_WIN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FIRST_WIN === 'true';

// Same flag AppTopbar/ChappiDock read. The right-hand column (the rollout menu
// with the UrgAns chat under it) is mounted by AppShell now (URG-210 — it rides
// every chrome page, not just the catalog); this view only needs the flag to
// gate its chat-aware behavior (the scope live-sync below).
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// The UrgAns planner. When on, a release with no activities shows the planner
// card as its whole empty state, and the Plan pill joins the scene switcher
// until a plan is approved. Supersedes the immediate-apply tailor-plan feature,
// which mutated real task rows the moment the model answered.
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';
const DIRECTORY_ENABLED = process.env.NEXT_PUBLIC_FEATURE_DIRECTORY === 'true';
const DIRECTORY_REQUESTS_ENABLED =
  DIRECTORY_ENABLED && process.env.NEXT_PUBLIC_FEATURE_DIRECTORY_REQUESTS === 'true';

// The four flag-gated scene params (calendar / capture / song / coverart) used
// to be read here as local consts and compared inline. They now live behind
// `resolveActiveScene` in lib/scene-cache.ts, because TasksPanel and
// WorkspaceSkeleton need the identical answer and the copies had drifted.

// Team logins (2026-08-16). Gates ONLY the compulsory post-create step here;
// the mint endpoint behind it is the pre-existing, ungated invite-link route.
const TEAM_LOGINS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TEAM_LOGINS === 'true';

// Type-first create (founder call, 2026-09-01): the create modal becomes a
// one-tap type picker, and the tap lands STRAIGHT in the new release — no
// access step, no first-win, no ?new=1 guide. Name and date are prompted
// later, inside the release (ReleaseSetupSheet, nudged once after the user
// has explored). Documented as incompatible with RELEASE_PLANNER and
// FIRST_WIN in .env.example.
const TYPE_FIRST_CREATE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_TYPE_FIRST_CREATE === 'true';
// The one-tap test path (founder request, 2026-09-01): entry buttons on the
// zero-release empty state and the first-release pop-up, a standing banner
// with the delete exit while a test release is scoped. Read through the
// predicate so the env var name is typed exactly once (lib/test-release.ts).
const TEST_RELEASE_ENABLED = isTestReleaseEnabled();
// Share to socials (2026-09-23): the Share button on every rollout, and the
// once-only offer after the first one, made on Home in the next visit (see
// withFirstShareOffer).
const SOCIAL_SHARE_ENABLED = isSocialShareEnabled();

// Dynamic for the same reason AppShell already loads it that way — a static
// import here defeated that, dragging the ~460-line modal into the /dashboard
// entry chunk that every user downloads before first paint, for a surface
// most sessions never open.
// Release scenes load on demand (2026-10-15, perf pass URG-314). The scene
// panel pulls in every scene (metadata, assets, songs, cover art, calendar,
// pitching, promo, distribution, spend, chat) and the timeline, all of which
// were in /dashboard's first-load JavaScript though none is on screen until a
// scene is opened. Each is now its own chunk, warmed on idle (below) on a
// connection that can afford it, so opening a scene stays instant.
const loadReleaseScenePanel = () => import('@/components/releases/ReleaseScenePanel');
const loadTimelineScene = () => import('@/components/releases/TimelineScene');
function SceneLoading() {
  return (
    <div className="space-y-4 p-4" aria-busy="true" aria-label="Loading">
      <SkeletonBlock className="h-7 w-1/2 rounded-lg" />
      <SkeletonBlock className="h-32 rounded-xl" />
      <SkeletonBlock className="h-32 rounded-xl" />
    </div>
  );
}
const ReleaseScenePanel = dynamic(() => loadReleaseScenePanel().then((m) => m.ReleaseScenePanel), {
  ssr: false,
  loading: () => <SceneLoading />,
});
const TimelineScene = dynamic(() => loadTimelineScene().then((m) => m.TimelineScene), {
  ssr: false,
  loading: () => <SceneLoading />,
});
function warmReleaseScenes() {
  void loadReleaseScenePanel().catch(() => undefined);
  void loadTimelineScene().catch(() => undefined);
}

const CreateReleaseModal = dynamic(
  () => import('@/components/releases/CreateReleaseModal').then((m) => m.CreateReleaseModal),
  { ssr: false }
);

// Only ever requested once the setup nudge actually fires, and never while
// the type-first flag is off.
const ReleaseSetupSheet = dynamic(
  () => import('@/components/releases/ReleaseSetupSheet').then((m) => m.ReleaseSetupSheet),
  { ssr: false }
);

// Edits the title and release day of a rollout that already has both. Opened
// from the Spotify pitch's closed-window banner ("Move release date").
const ReleaseDetailsSheet = dynamic(
  () => import('@/components/releases/ReleaseDetailsSheet').then((m) => m.ReleaseDetailsSheet),
  { ssr: false }
);

type ToastState = {
  message: string;
  tone: 'success' | 'error' | 'warning';
};

/**
 * Parse a createdAt ISO string to epoch ms. Empty/invalid values map to 0 so
 * those releases sort to the bottom deterministically rather than producing
 * NaN comparator results (which is undefined behavior in Array#sort).
 */
function toCreatedMs(value: string): number {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function WorkspaceView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, error, loadCommandCenter, removeReleaseLocal } =
    useReleaseStore();
  const tasks = useTaskStore((state) => state.tasks);
  const { scopedReleaseId, setScope } = useReleaseScope();
  // Which release scene (if any) the URL has open. It renders INLINE in the
  // activity slot rather than as an overlay (founder call, 2026-08-05: "like
  // the way UrgAns is on the side but in the place where activity lists
  // appear"), so this view has to know about it to build the panel body and to
  // give the calendar its width.
  const { activeScene: urlScene, closeScene } = useSceneOverlay();
  // Flag-gate the scene the URL names: with a flag off the param reads as
  // no-scene, matching the pill (which never renders) and the API routes (which
  // 404). One shared resolver rather than a local copy — TasksPanel and
  // WorkspaceSkeleton have to agree with this exactly, and the three
  // hand-rolled copies this replaces had already drifted once.
  const activeScene = resolveActiveScene(urlScene);

  /**
   * What the panel actually shows: a named scene, or the release's MAIN VIEW.
   *
   * `activeScene` answers "is a scene open"; this answers "what is on screen",
   * and since 2026-09-06 those differ — with the timeline flag on, a release
   * with no `?scene=` lands on the timeline rather than the activity buckets
   * (founder call: the buckets ship collapsed, so a 63-activity release opened
   * onto five closed drawers). One resolver, shared with TasksPanel and
   * WorkspaceSkeleton, so the body, the lit pill and the reserved layout
   * cannot disagree.
   */
  const panelBody = resolvePanelBody(urlScene);
  // The rollout the timeline was opened full screen on, or null. See
  // `timelineIsFull` below for how it is read.
  const [timelineFullFor, setTimelineFullFor] = useState<string | null>(null);
  const bodyIsMainView = panelBody === 'activities' || panelBody === 'timeline';
  // Which of the two always-in-the-DOM layout branches (mobile drill-down /
  // desktop focused) should receive side-effectful children — see the hook.
  const isDesktopViewport = useIsDesktopViewport();
  // Warm the scoped release's four scenes during idle time, so the pills in
  // TasksPanel's header open instantly instead of each costing a round trip.
  // Skipped entirely on Data Saver / 2g — see useScenePrefetch.
  useScenePrefetch(scopedReleaseId, !isInitialLoading);
  // Same global quick-create the New activity button beside the Motion bar
  // opens — the date card's "add an activity yourself" action routes here so
  // both entry points land in one modal (URG-233).
  const { openQuickCreate, openTask } = useTaskUI();
  const isRailOpen = useChappiStore((state) => state.railOpen);
  // The intake modal is mounted once by AppShell; this opens it. Building the
  // plan happens inside it now (2026-09-15) — there is no one-tap path left
  // here, so this view only ever OPENS the questions and reacts once the
  // store reports what came of them.
  const openIntake = usePlannerStore((state) => state.openIntake);
  // True between the intake firing the build and it returning, so the card
  // can say UrgAns is working rather than showing an empty plan.
  const isPlanGenerating = usePlannerStore((state) =>
    scopedReleaseId ? state.generatingReleaseIds.includes(scopedReleaseId) : false
  );
  // A build the intake fired for THIS release that landed, or one that was
  // refused with nothing created (typed notes UrgAns could not read).
  const lastBuilt = usePlannerStore((state) => state.lastBuilt);
  const clearBuilt = usePlannerStore((state) => state.clearBuilt);
  const buildError = usePlannerStore((state) => state.buildError);
  const planBuildError =
    buildError && buildError.releaseId === scopedReleaseId ? buildError.message : null;
  // Set when a Solo team's release.draft_plan run refuses with
  // reason: 'plan_required' — fired from the intake's own fire-and-forget
  // submit, and rendered as the ONE UrgansLockedSheet mount at the bottom of
  // this component.
  const lockedRefusal = usePlannerStore((state) => state.lockedRefusal);
  const setLockedRefusal = usePlannerStore((state) => state.setLockedRefusal);
  // Task detail renders as a global pop-up mounted by TaskUIProvider
  // (2026-07-23) — this view no longer swaps its layout when a task opens.
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Set to the new release's id when a first-release "win" reveal should show.
  const [winReleaseId, setWinReleaseId] = useState<string | null>(null);

  // The compulsory post-create "get your team in" step (2026-08-16). Holds the
  // deferred continuation of the create flow — `resume` is whatever the flow
  // would have done next — so the step runs first without any of the branch
  // logic below having to know it exists.
  const [accessStep, setAccessStep] = useState<{
    releaseId: string;
    title: string | null;
    resume: () => void;
  } | null>(null);

  // The test release the standing banner's delete button is asking about;
  // null = dialog closed. Only ever set for the SCOPED release, and only when
  // it carries the test marker and the viewer owns it (the banner's own gate).
  const [testReleaseToDelete, setTestReleaseToDelete] = useState<Pick<
    Release,
    'id' | 'title'
  > | null>(null);

  // AI actions + toast, ported verbatim from the removed release detail page
  // (2026-08-04) — this is now the only surface a scoped release renders on.
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isChangeArtistOpen, setIsChangeArtistOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // The roster decides whether "Change artist" is worth offering at all. Read
  // from the shared store (not the identity store, which is behind a flag that
  // defaults off) and loaded once per session by the effect below.
  const rosterArtists = useArtistRosterStore((state) => state.artists);
  const loadArtistRoster = useArtistRosterStore((state) => state.load);
  // One-time getting-started guide (NewReleaseGuide), triggered by ?new=1
  // alongside ?release= from the create flows. Read into state once, then
  // both params are stripped via router.replace so a refresh never
  // re-triggers it — the guide's own visibility is controlled purely by
  // this boolean from then on (dismiss just flips it false, no URL churn).
  const [showNewReleaseGuide, setShowNewReleaseGuide] = useState(false);
  // Warm the release scenes' chunks once the workspace is up (see
  // loadReleaseScenePanel above). Skipped on Save-Data / 2G.
  useEffect(() => {
    if (!shouldBackgroundPrefetch()) return;
    return runWhenIdle(warmReleaseScenes, 6_000);
  }, []);

  useEffect(() => {
    if (searchParams.get('new') !== '1' || !scopedReleaseId) return;
    setShowNewReleaseGuide(true);
    // Consume ONLY `new`. This used to rebuild the URL from scratch as
    // `/dashboard?release=<id>`, which silently dropped `scene` along with the
    // calendar's `calendar`/`month` — so any create flow that landed on a
    // scene lost it the instant the guide was consumed, and the user was left
    // on the main view wondering what they had just tapped.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const query = params.toString();
    router.replace(`/dashboard${query ? `?${query}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount to consume the param; router/searchParams identity churn shouldn't re-fire this.
  }, []);

  // A catalog of one is not a catalog (founder call, 2026-08-12). With a
  // single release there is nothing to choose between, so the grid/list is a
  // dead click between the user and the only work they have — the same
  // reasoning that made zero releases open the create screen outright
  // (v0.45.0). At exactly one release the workspace scopes to it on arrival
  // and drops every "back to releases" affordance, so activities ARE the
  // dashboard.
  //
  // Deliberately not applied at 2+: the moment there is a choice to make, the
  // catalog is how you make it.
  const isSingleRelease = releases.length === 1;
  // ...unless the user ASKED for the catalog, in which case the convenience is
  // off the table for the rest of this browser session. Read once at mount and
  // never re-read: the record only ever goes unset → set, and it is set by a
  // navigation to /dashboard, so a stale `false` can only occur on a mount that
  // was already showing the catalog — where the ref below is spent and nothing
  // auto-scopes anyway.
  //
  // WHY IT IS NOT THE REF BELOW. That ref is per MOUNT, and this component
  // unmounts every time you leave /dashboard — which Home, Catalog and the back
  // arrow all do. So the ref's "one chance" came back on every return, and
  // tapping Home from Settings on a single-release account was dragged straight
  // back into the release (founder report, 2026-09-01). The fact has to outlive
  // the component, so it lives in sessionStorage: see lib/catalog-intent.ts for
  // the full history, and note it FAILS TOWARD NOT AUTO-SCOPING.
  //
  // Reading storage in a lazy initializer is safe here, and only here, because
  // the skeleton gate below short-circuits on `authLoading` — true on the first
  // render for the server AND the client (auth-store's initial `isLoading: true`
  // is not persisted), so both render the skeleton and this value cannot change
  // the first paint. If that gate ever stops leading with authLoading, this has
  // to move to a mount effect.
  const [catalogRequested] = useState(isCatalogRequested);
  // "The auto-scope has HAD ITS ONE CHANCE this mount" — not "the auto-scope
  // ran". The distinction is the bug: without this guard an explicit back tap
  // (which clears `scopedReleaseId`) immediately re-triggered the effect below
  // and re-scoped straight back into the only release, so the back button
  // rendered but could never do anything. One auto-scope on arrival is the
  // intended convenience; re-fighting a deliberate exit is what made the
  // workspace un-leavable for single-release accounts.
  //
  // Read the effect for which arrivals spend the chance. Arriving ALREADY
  // scoped spends it, and missing that case is how the same bug survived here
  // for anyone who refreshed or followed a link into a scoped release.
  const hasAutoScopedRef = useRef(false);
  useEffect(() => {
    // Wait for the first load: `releases` is empty until it lands, and acting
    // on that would look like zero releases rather than one.
    // `catalogRequested` first among the bails, because it is the one that
    // makes a deliberate navigation stick: the user is standing on the catalog
    // because they asked to be, and re-scoping them would undo the tap.
    if (isInitialLoading || hasAutoScopedRef.current || catalogRequested) return;
    // 0 or 2+ releases: the chance stays OPEN deliberately. A brand-new account
    // has zero here and is prompted to create one (deferred — see
    // useFirstReleasePrompt); when its first release lands, isSingleRelease
    // flips true and that account should still get its one auto-scope.
    // Consuming the chance now would silently remove it.
    if (!isSingleRelease) return;
    // ARRIVED ALREADY SCOPED — a refresh, a bookmark, an UrgAns link, or the
    // /dashboard/releases/[releaseId] redirect stub. The convenience this effect
    // exists to provide is already satisfied, so the chance is SPENT.
    //
    // This line is the whole fix for a back button that did nothing. Without it
    // the ref stayed false on every such arrival, so the first back press
    // cleared the scope, which then satisfied every guard below, and this effect
    // dragged the user straight back into the release — invisibly, because the
    // skeleton gate further down covers exactly that frame. The ref's comment
    // above claimed this bug was fixed; the fix only covered arrivals where the
    // auto-scope had actually run.
    if (scopedReleaseId) {
      hasAutoScopedRef.current = true;
      return;
    }
    hasAutoScopedRef.current = true;
    // `replace`, the hook's default — an auto-scope the user never asked for
    // must not become a history entry they have to press Back through, and
    // Back from here should leave the workspace, not restore a catalog this
    // release count has no route to.
    setScope(releases[0].id);
  }, [isInitialLoading, isSingleRelease, scopedReleaseId, releases, setScope, catalogRequested]);

  // Fire the dashboard fetch IMMEDIATELY, without waiting on the auth store.
  // loadCommandCenter reads its own bearer token from supabase.auth.getSession()
  // (a local storage read), so it doesn't need the auth store's server-verified
  // profile — gating it behind authLoading serialized it after the GoTrue
  // getUser round trip for no benefit. With no session it returns silently and
  // the effect below redirects.
  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  // Same shape, and same reasoning: the store reads its own bearer token, and
  // its recency guard collapses this to a no-op on every navigation after the
  // first. Failing leaves the roster empty, which reads as "one artist" and
  // simply hides the Change artist action — never an error.
  useEffect(() => {
    void loadArtistRoster();
  }, [loadArtistRoster]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    // Backstop for the early call above: if the session wasn't readable yet at
    // mount, this re-runs it once auth resolves. Cheap — the store's in-flight
    // and recency guards collapse it to a no-op in the normal case.
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, router, user]);

  // The deferred first-release prompt (2026-08-28, founder call — supersedes
  // URG-217's immediate open): a zero-release account sees the workspace
  // first, then the create modal offers itself about half a minute in, once
  // per browser session, and can be dismissed. Only arms once the store has
  // CONFIRMED zero releases — the predicate fails open while loading and on
  // load errors, so a network blip never prompts anyone. Deleting your last
  // release re-arms the condition by design (once per session still holds).
  useFirstReleasePrompt(() => setIsCreateModalOpen(true));

  // The one-tap test-release create. No onError option here on purpose: on
  // this page the failure surface is the empty state itself — the entry
  // buttons render the hook's `error` inline — so a toast would double-report.
  const {
    startTestRelease,
    isStarting: isStartingTestRelease,
    error: testReleaseError,
  } = useStartTestRelease();
  // One object handed to both catalog surfaces (the ReleasesColumn /
  // WorkspaceDesktopGrid `testRelease` prop). The flag gate lives HERE — the
  // components stay dumb, and with the flag off both render their empty
  // states byte-identically to before this feature existed.
  const testReleaseEntry = TEST_RELEASE_ENABLED
    ? { start: startTestRelease, isStarting: isStartingTestRelease, error: testReleaseError }
    : undefined;

  // A plan the intake built (or failed to) for the currently scoped release.
  // `lastBuilt`/`buildError` are global store fields — the intake has already
  // closed and navigated by the time either resolves — so this is where the
  // outcome actually lands: refresh the catalog so the new activities show,
  // say so, offer Tour B, and clear the field so a
  // later scope change (or a second build) can't replay it.
  //
  // Nothing here reacts to a build for a DIFFERENT release than the one
  // scoped right now — a manager who navigated away before it finished sees
  // none of this, but PlanBuiltBanner reads the stored plan directly on the
  // next visit, so the summary is never actually lost.
  useEffect(() => {
    if (!lastBuilt || lastBuilt.releaseId !== scopedReleaseId) return;
    clearBuilt();
    void loadCommandCenter({ force: true });
    setToast({
      message: `Plan built: ${lastBuilt.plan.tasksCreated} ${
        lastBuilt.plan.tasksCreated === 1 ? 'activity' : 'activities'
      }.`,
      tone: 'success',
    });
    // The post-plan press kit offer left Oct 17, 2026 with the standalone
    // press kit (founder approved "cuts-3"); the kit is Pitch this!'s now.
    // The "Your rollout is planned / Take the tour" offer card that followed
    // here was removed Oct 17, 2026 (founder: "this is not needed at all").
    // The tour itself (lib/tours.ts, TourOfferCard, the store) is kept.
  }, [lastBuilt, scopedReleaseId, clearBuilt, loadCommandCenter]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), toastDismissMs(toast.tone, toast.message));
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // Live-sync the assistant's scoped release to the catalog's open release
  // WHILE the rail is VISIBLE beside it. The deps array IS the transition
  // detector: the rail appearing fires this immediately (including `null` =
  // "All releases"); changing/clearing the catalog selection while it is open
  // fires it again; a manual pick inside ChappiScopePicker only touches the
  // store (no dep here changes), so it holds until the next catalog
  // transition.
  //
  // `isDesktopViewport` is load-bearing, not defensive (2026-08-19 fix). This
  // used to run below lg as well, waved off as "harmless if railOpen lingers
  // there" — but `railOpen` is not a lingering edge case on a phone: AppShell
  // arms it once per session on the first chrome-bearing page with no viewport
  // check, and persists it. So on mobile this fired on every WorkspaceView
  // mount, and the rail it was supposedly mirroring is `hidden lg:block` — it
  // was never on screen. Switching UrgAns -> Home therefore wiped the release
  // the user had pinned in the assistant's own picker (to `null` on a
  // multi-release account, or to the auto-scoped release on a single-release
  // one), and switching back showed the wrong working context.
  //
  // Below lg the coupling is deliberately ONE-WAY and event-driven instead:
  // MobileNavBar's UrgAns tab (and AppTopbar's icon, flag-off) carry the
  // drilled-in release across at the moment of navigation, and both are
  // careful to do it ONLY when a release is actually scoped precisely so a
  // bare navigate cannot clobber the picker's choice. This effect was the one
  // thing bypassing that rule.
  useEffect(() => {
    if (!CHAPPI_ENABLED || !isRailOpen || !isDesktopViewport) return;
    useChappiStore.getState().setScopedReleaseId(scopedReleaseId);
  }, [isDesktopViewport, isRailOpen, scopedReleaseId]);

  // ExecutionTask extends Task by intersection; assignable without cast.
  const taskList: Task[] = tasks;

  const releaseCards: ReleaseCardData[] = useMemo(() => {
    // Newest-first by canonical createdAt. Spread before sort so the
    // useReleaseStore reference stays untouched. Array#sort is stable on
    // every engine we ship to (ES2019+), so equal timestamps preserve their
    // original order without extra tie-breaking.
    const sortedReleases = [...releases].sort(
      (a, b) => toCreatedMs(b.createdAt) - toCreatedMs(a.createdAt)
    );

    return sortedReleases.map((release) => {
      const releaseTasks = taskList.filter((task) => task.releaseId === release.id);
      const tasksDone = releaseTasks.filter((task) => task.status === 'done').length;
      return {
        release: {
          id: release.id,
          title: release.title,
          artistName: release.artistName,
          status: release.status,
          releaseDate: release.releaseDate,
        },
        tasksDone,
        tasksTotal: releaseTasks.length,
        coverArtUrl: release.coverArtUrl ?? null,
        // Derived client-side from the metadata the command-center already
        // ships raw — no new API surface. The flag is folded in so every
        // "Test" tag goes dark on a flip-off, even for rows still carrying
        // the marker.
        isTest: TEST_RELEASE_ENABLED && readTestRelease(release.metadata),
      };
    });
  }, [releases, taskList]);

  // `releaseDate` is here for the content calendar scene (it resolves the
  // default month from the release date) and for SetReleaseDateCard's
  // show/hide condition; `templatePending` picks that card's variant
  // (URG-230). The panels that only need id/title/artistName accept this
  // wider shape structurally.
  const scopedReleaseSlim = useMemo<
    | (Pick<
        Release,
        | 'id'
        | 'title'
        | 'artistId'
        | 'artistName'
        | 'releaseType'
        | 'releaseDate'
        | 'templatePending'
        | 'status'
        | 'ownerUserId'
        | 'metadata'
        | 'createdAt'
      > & { isTest: boolean })
    | null
  >(() => {
    if (!scopedReleaseId) return null;
    const found = releases.find((r) => r.id === scopedReleaseId);
    if (!found) return null;
    return {
      id: found.id,
      title: found.title,
      // Feeds the change-artist dialog, which needs the CURRENT link to know
      // what a move is moving away from.
      artistId: found.artistId,
      artistName: found.artistName,
      // Feeds the per-playbook runway copy in SetReleaseDateCard and
      // NewReleaseGuide, which would otherwise quote single's 8 weeks at an
      // album's 17.
      releaseType: found.releaseType,
      releaseDate: found.releaseDate,
      templatePending: found.templatePending,
      status: found.status,
      // Gates the two OWNER-ONLY actions below (archive, set-date): both
      // routes deliberately keep owner-only checks, so offering them to a
      // teammate is a button that 404s on press.
      ownerUserId: found.ownerUserId,
      // PlanBuiltBanner's readPlannedByUrgans reads this raw, the same way
      // isTest below does.
      metadata: found.metadata,
      // The first steps (URG-293) only show while a rollout is new.
      createdAt: found.createdAt,
      // Derived, not stored on Release: the metadata jsonb already reaches
      // this component raw, nothing server-side reads the marker back after
      // creation, and folding the flag in here means the banner goes dark on
      // a flip-off along with everything else.
      isTest: TEST_RELEASE_ENABLED && readTestRelease(found.metadata),
    };
  }, [scopedReleaseId, releases]);

  // The type-first setup nudge (2026-09-01): once per release, after the
  // user has explored a little (scroll / scene open / short dwell — the
  // arming rules are pure and tested in lib/release-setup-prompt.ts). Holds
  // while the create modal owns the screen.
  const setupPrompt = useReleaseSetupPrompt({
    flagOn: TYPE_FIRST_CREATE_ENABLED,
    releaseId: scopedReleaseSlim?.id ?? null,
    templatePending: Boolean(scopedReleaseSlim?.templatePending),
    hasReleaseDate: Boolean(scopedReleaseSlim?.releaseDate),
    suspended: isCreateModalOpen,
    sceneOpen: Boolean(activeScene),
  });
  // Whether the scoped release belongs to the signed-in user. Fails OPEN on
  // missing data (legacy cache rows without ownerUserId, auth still
  // resolving) — the ReleasesSection pattern: hiding an owner's own controls
  // is worse than a teammate seeing a control the server refuses.
  const scopedReleaseIsOwn =
    !scopedReleaseSlim?.ownerUserId || !user?.id || scopedReleaseSlim.ownerUserId === user.id;

  // Differentiate browser tabs when a release is scoped, ported from the
  // removed release detail page — falls back to the default dashboard
  // title the moment the scope clears or the release isn't found.
  useEffect(() => {
    if (scopedReleaseSlim?.title) {
      document.title = `${scopedReleaseSlim.title} | Urganize`;
      return;
    }
    document.title = 'Dashboard | Urganize';
  }, [scopedReleaseSlim?.title]);

  const scopedTasks = useMemo<Task[]>(() => {
    if (!scopedReleaseId) return taskList;
    return taskList.filter((task) => task.releaseId === scopedReleaseId);
  }, [scopedReleaseId, taskList]);

  // The Spotify editorial pitch for the scoped rollout (2026-10-09), if it has one.
  const editorialPitchTask = useMemo(
    () => scopedTasks.find((task) => isEditorialPitchTask(task.templateTaskId)) ?? null,
    [scopedTasks]
  );

  // A rollout planned before the pitch step existed gets it the first time it
  // is opened. The server decides everything and records the decision; this only
  // asks when it could matter: a dated, active, planned rollout with no pitch
  // task and more than 7 days to go. Once per rollout per tab, and a refresh
  // only when the plan actually changed.
  const pitchBackfillReleaseId =
    scopedReleaseSlim &&
    scopedReleaseSlim.releaseDate &&
    !scopedReleaseSlim.isTest &&
    isReleaseActive(scopedReleaseSlim.status) &&
    scopedTasks.length > 0 &&
    !editorialPitchTask &&
    pitchWindowState(daysToRelease(scopedReleaseSlim.releaseDate, new Date())) === 'open'
      ? scopedReleaseSlim.id
      : null;
  useEffect(() => {
    if (!pitchBackfillReleaseId) return;
    void requestEditorialPitchBackfill(pitchBackfillReleaseId).then((changed) => {
      if (changed) void loadCommandCenter({ force: true });
    });
  }, [pitchBackfillReleaseId, loadCommandCenter]);

  // The jobs on this release nobody is on yet (the directory's role gaps,
  // 2026-09-05). Owner-only, like the other release-row affordances here:
  // reassigning is the action this leads to, and offering it to a teammate who
  // cannot take it is a control that fails on press.
  //
  // NOT gated on the press kit. The brief sequences this after the kit is
  // published, which describes the journey rather than a precondition —
  // reading that as a hard gate would make the panel invisible whenever a
  // different feature's flag is off.
  const roleGaps = useMemo(() => {
    if (!DIRECTORY_ENABLED || !scopedReleaseSlim || !scopedReleaseIsOwn) return [];
    const ownerUserId = scopedReleaseSlim.ownerUserId || user?.id || '';
    if (!ownerUserId) return [];
    return findRoleGaps(
      scopedTasks.map((task) => ({
        id: task.id,
        templateTaskId: task.templateTaskId,
        assignedToUserId: task.assignedToUserId,
        status: task.status,
        dueDate: task.dueDate,
        title: task.title,
      })),
      ownerUserId
    );
  }, [scopedReleaseSlim, scopedReleaseIsOwn, scopedTasks, user?.id]);

  // The focused release's card. `selectedCard` is null when the URL points
  // at a release that doesn't exist in this user's data (stale link, deleted
  // release) and we fall back to the grid below.
  //
  // (Until 2026-09-30 this also split the OTHER releases into a left and a right
  // rail of cards either side of the focused one. Those rails are gone — the
  // right-hand column carries the rollout menu and the UrgAns chat now, and the
  // catalog is one press of the back arrow away.)
  const selectedCard = useMemo(
    () =>
      scopedReleaseId
        ? (releaseCards.find((c) => c.release.id === scopedReleaseId) ?? null)
        : null,
    [releaseCards, scopedReleaseId]
  );

  // Desktop focused mode is gated on BOTH the URL scope and a successful
  // lookup. URL pointing at a stale release id → fall back to the grid
  // (and clear the param so back-button doesn't trap the user). Mobile
  // path uses `scopedReleaseSlim` directly for the same reason.
  const isDesktopFocusedMode = Boolean(scopedReleaseId && selectedCard);

  // The catalogue's table rows (design overhaul, 2026-10-04): the cards plus
  // what the table needs that a card never showed, the artist id (for the top
  // bar's artist filter) and the next unfinished activity. Built from the same
  // store data, so it can never disagree with the cards.
  const catalogueRows: CatalogueRow[] = useMemo(
    () =>
      releaseCards.map((card) => {
        const source = releases.find((release) => release.id === card.release.id);
        const releaseTasks = taskList.filter((task) => task.releaseId === card.release.id);
        return {
          id: card.release.id,
          title: card.release.title,
          artistId: source?.artistId ?? null,
          artistName: card.release.artistName,
          // Released is derived (lib/recap-eligibility's rule), never written.
          status: displayStatus({
            status: card.release.status,
            releaseDate: card.release.releaseDate,
            tasksDone: card.tasksDone,
            tasksTotal: card.tasksTotal,
          }),
          releaseDate: card.release.releaseDate,
          tasksDone: card.tasksDone,
          tasksTotal: card.tasksTotal,
          coverArtUrl: card.coverArtUrl ?? null,
          isTest: Boolean(card.isTest),
          nextTask: pickNextTask(
            releaseTasks.map((task) => ({
              title: task.title,
              status: task.status,
              dueDate: task.dueDate,
            }))
          ),
        };
      }),
    [releaseCards, releases, taskList]
  );
  // The catalogue is what is on screen whenever no rollout is focused.
  const showCatalogue = !(scopedReleaseId && scopedReleaseSlim) && !isDesktopFocusedMode;

  // The phone rollout header's shared state (rollout declutter, Oct 18, 2026):
  // SubNav hides its Artists / Rollouts tabs while a rollout is open, and the
  // header's search and menu icons reset when the rollout changes.
  const setPhoneRolloutOpen = useRolloutPhoneChrome((state) => state.setRolloutOpen);
  const setPhoneSearchOpen = useRolloutPhoneChrome((state) => state.setSearchOpen);
  const setPhoneMenuOpen = useRolloutPhoneChrome((state) => state.setMenuOpen);
  const phoneRolloutOpen = Boolean(scopedReleaseId);
  useEffect(() => {
    setPhoneRolloutOpen(phoneRolloutOpen);
  }, [phoneRolloutOpen, setPhoneRolloutOpen]);
  useEffect(() => () => setPhoneRolloutOpen(false), [setPhoneRolloutOpen]);
  useEffect(() => {
    setPhoneSearchOpen(false);
    setPhoneMenuOpen(false);
  }, [scopedReleaseId, panelBody, setPhoneSearchOpen, setPhoneMenuOpen]);

  /** Open the planning questions for the scoped release — the ONLY door into
   *  the planner (2026-09-15): finishing them is what builds the plan, so
   *  there is no separate one-tap path here any more. */
  const openPlanIntake = () => {
    if (!scopedReleaseId) return;
    // What the rollout already knows rides along (2026-10-11), so the planner
    // does not ask the type, the date or the artist a second time. Each value
    // only skips its question when it is usable (lib/planner-intake-steps.ts).
    const prefill = scopedReleaseSlim ? scopedRolloutIntakePrefill(scopedReleaseSlim) : {};
    openIntake({ source: 'empty_state', releaseId: scopedReleaseId, prefill });
  };

  // Onboarding lands here, on the rollout it just created, and opens the
  // planner straight away (2026-10-11). The hand-off is a per-tab marker
  // onboarding left (lib/first-session.ts), taken only once this exact rollout
  // is in the catalog, so the prefill is the rollout's own facts. Its answers
  // (type, date, artist) skip their questions, so the first plan asks four.
  useEffect(() => {
    if (!PLANNER_ENABLED || !scopedReleaseId || !scopedReleaseSlim) return;
    if (usePlannerStore.getState().intake) return;
    const handoff = takeOnboardingPlannerHandoff(scopedReleaseId);
    if (!handoff) return;
    // Auto-planned (2026-10-17): the plan is building by itself; no questions.
    if (readPlannerAuto(scopedReleaseSlim.metadata)) return;
    // Already planned (another tab, or a plan built some other way): the
    // marker is spent and there is nothing to ask.
    if (scopedTasks.length > 0) return;
    const fromRelease = scopedRolloutIntakePrefill(scopedReleaseSlim);
    openIntake({
      source: 'onboarding',
      releaseId: scopedReleaseId,
      prefill: {
        ...fromRelease,
        ...(handoff.releaseType ? { releaseType: handoff.releaseType } : {}),
        ...(handoff.releaseDate ? { releaseDate: handoff.releaseDate } : {}),
        ...(handoff.artistName ? { artistName: handoff.artistName } : {}),
        // Asked once in onboarding: the planner skips "What's already done?".
        ...(handoff.readyToday?.length ? { readyToday: handoff.readyToday } : {}),
      },
    });
  }, [scopedReleaseId, scopedReleaseSlim, scopedTasks.length, openIntake]);


  // "Has this release actually happened", via the SAME
  // lib/recap-eligibility.ts predicate the recap route gates on rather than a
  // re-implementation. It used to be a hand-rolled copy that merely "mirrored"
  // the server — a drift hazard that got worse the moment a second consumer
  // depended on the same answer. Release day itself counts, and the
  // all-tasks-done clause is what makes "complete" real today, since nothing in
  // the product writes the released status.
  //
  // Its ONE consumer here is now the archive action: the recap's own button
  // was removed 2026-09-07 (founder call — the recap is asked for in the UrgAns
  // conversation, which hands the poster over inline). It keeps the recap name
  // because that is what the shared predicate is, and the recap route and
  // lib/delivery-records.ts are its other two callers.
  const isRecapEligible = useMemo(() => {
    if (!scopedReleaseSlim) return false;
    return isRecapEligibleForRelease(
      {
        releaseDate: scopedReleaseSlim.releaseDate ?? null,
        status: scopedReleaseSlim.status ?? '',
      },
      {
        totalTasks: scopedTasks.length,
        allTasksDone: scopedTasks.every((task) => task.status === 'done'),
      }
    );
  }, [scopedReleaseSlim, scopedTasks]);

  // Archive is offered once a release reads as finished — the same eligibility
  // the recap uses, because "worth celebrating" and "safe to shelve" are the
  // same moment. Offering it on a release still in flight would invite someone
  // to shelve work they are mid-way through. A release already archived shows
  // Restore instead, so the action is always a round trip rather than a
  // one-way door.
  const isScopedArchived = !isReleaseActive(scopedReleaseSlim?.status);
  const archiveAction =
    scopedReleaseId && scopedReleaseIsOwn && (isRecapEligible || isScopedArchived)
      ? {
          label: isScopedArchived ? 'Restore rollout' : 'Archive rollout',
          onClick: () => setIsArchiveOpen(true),
        }
      : null;

  // Moving a release to another artist. Offered only when there is somewhere to
  // move it TO — the create-release picker's rule, so a one-artist team never
  // sees a control that can only tell it no.
  //
  // Owner-only for the same reason archive is, and a sharper one: this changes
  // who can see the release, because an artist-scoped teammate sees exactly the
  // releases whose artist matches their scope.
  const changeArtistAction =
    scopedReleaseId && scopedReleaseIsOwn && rosterArtists.length > 1
      ? { label: 'Change artist', onClick: () => setIsChangeArtistOpen(true) }
      : null;

  // Share to socials (founder request, 2026-09-23): after the first rollout's
  // one-time offer, this is how every rollout gets shared. NOT owner-only,
  // unlike the two actions above: making a post changes nothing, and the image
  // route is a team READ, so any member (and a read-only guest) can use it.
  const shareAction =
    SOCIAL_SHARE_ENABLED && scopedReleaseId
      ? {
          label: 'Share to socials',
          onClick: () =>
            useShareStore.getState().open({ releaseId: scopedReleaseId, source: 'rollout_menu' }),
        }
      : null;

  // With the planner on, a scoped release with no activities shows the planner
  // card as its ENTIRE body — no empty list under it, nothing above it. That is
  // what makes the main door impossible to miss.
  //
  // It also supersedes the plan-waiting date card for this case: that card asks
  // for a date so the template can be instantiated, and under the planner the
  // date is question three of the intake instead.
  // The test path's standing exit (founder call, 2026-09-01: the path "ends
  // with an option to delete", and a standing banner beat a guided tour —
  // wherever the user stops exploring, the way out is right there). Gated on
  // scopedReleaseIsOwn like setReleaseDateBanner below: DELETE is owner-only,
  // and a delete button that 404s is worse than no banner. First in the
  // activitiesBanner chain because it states what the release IS; in practice
  // the three banners are mutually exclusive anyway (a test release always
  // has a date and a full plan). Degenerate case accepted: if instantiation
  // soft-failed server-side, a zero-activity test release shows this banner
  // above TasksPanel's own empty state, and the delete exit still works.
  const testReleaseBanner =
    scopedReleaseSlim && scopedReleaseSlim.isTest && scopedReleaseIsOwn ? (
      <TestReleaseBanner
        onDelete={() =>
          setTestReleaseToDelete({ id: scopedReleaseSlim.id, title: scopedReleaseSlim.title })
        }
      />
    ) : null;

  // Owner-only, matching release.draft_plan's own 'owner_write' access level
  // (see lib/urgans-actions/types.ts): the legacy plan route this reaches is
  // still owner-keyed, a deliberate, recorded deferral, so a non-owner
  // teammate offered this card would tap a working control that 404s.
  // The Spotify pitch window has closed: release day is 7 days away or less and
  // the pitch is still open. First in the banner chain because it is the only
  // one with a deadline. Moving the date is owner-only (the schedule route is),
  // so a teammate is offered only the skip.
  const editorialPitchBanner =
    scopedReleaseSlim &&
    editorialPitchTask &&
    editorialPitchTask.status !== 'done' &&
    editorialPitchTask.status !== 'cancelled' &&
    pitchWindowState(daysToRelease(scopedReleaseSlim.releaseDate, new Date())) === 'closed' ? (
      <EditorialPitchClosedBanner
        taskId={editorialPitchTask.id}
        canMoveDate={scopedReleaseIsOwn}
        onMoveDate={() => setIsDetailsOpen(true)}
        onSkipped={() => void loadCommandCenter({ force: true })}
        onError={(message) => setToast({ message, tone: 'error' })}
      />
    ) : null;

  // Auto-plan (2026-10-17): the rollout onboarding made builds its plan on
  // its own, so instead of the questions it shows the build, then the plan.
  const autoPlan = useAutoPlan({
    releaseId: PLANNER_ENABLED && scopedReleaseSlim && scopedReleaseIsOwn ? scopedReleaseSlim.id : null,
    metadata: scopedReleaseSlim?.metadata,
    release: scopedReleaseSlim
      ? {
          releaseType: scopedReleaseSlim.releaseType,
          artistName: scopedReleaseSlim.artistName,
          releaseDate: scopedReleaseSlim.releaseDate,
        }
      : null,
    hasActivities: !onlyPreProductionWork(scopedTasks),
    onLanded: () => void loadCommandCenter({ force: true }),
  });

  const planBanner =
    PLANNER_ENABLED && scopedReleaseSlim && scopedReleaseIsOwn && autoPlan.view ? (
      <AutoPlanCard
        state={autoPlan.view}
        startedAt={autoPlan.startedAt}
        retrying={autoPlan.retrying}
        onRetry={autoPlan.retry}
        onAddActivity={() => openQuickCreate({ releaseId: scopedReleaseSlim.id, source: 'inline' })}
      />
    ) :
    // A pre-production rollout (URG-280) still owes its release plan: its
    // eight seeded activities are not a plan, so the card stays until one is built.
    PLANNER_ENABLED && scopedReleaseSlim && scopedReleaseIsOwn && onlyPreProductionWork(scopedTasks) ? (
      <PlanReleaseCard
        state={isPlanGenerating ? 'generating' : planBuildError ? 'failed' : 'fresh'}
        failureMessage={planBuildError}
        onPlan={() => openPlanIntake()}
        onAddActivity={() =>
          openQuickCreate({ releaseId: scopedReleaseSlim.id, source: 'inline' })
        }
      />
    ) : null;

  // The plan-built banner (what the plan built, Worth a look, Promo that fits)
  // is cut from the rollout page (Oct 17, 2026 just-planned cuts, founder
  // approved): the timeline already says the count ("0 of 20 done") and where
  // to start (the "Start here" tag), and desktop full screen never showed it.
  // Hide only: PlanBuiltBanner, its summary and promo fits, and the "seen"
  // record all stay. `planBuiltFresh` is the moment it used to cover, kept so
  // the new-release guide still stays out of that moment.
  const planBuiltSeen = usePlanBuiltSeen(scopedReleaseSlim?.id ?? null);
  const planBuiltFresh = Boolean(
    scopedReleaseSlim &&
      scopedTasks.length > 0 &&
      readPlannedByUrgans(scopedReleaseSlim.metadata) &&
      !planBuiltSeen
  );

  // "Confirm your release date" pinned on top of a new user's first plan
  // (URG-251 flow, 2026-10-14): the rollout onboarding made in this browser,
  // until that activity is done. Read after mount (localStorage), never in
  // render, so the server HTML and the first client render agree.
  const [onboardingRolloutId, setOnboardingRolloutId] = useState<string | null>(null);
  useEffect(() => {
    setOnboardingRolloutId(readFirstSessionRecord()?.releaseId ?? null);
  }, [scopedReleaseId]);
  const pinnedConfirmDateTask = findPinnedConfirmDateTask({
    tasks: scopedTasks,
    isNewUserRollout: Boolean(scopedReleaseId && onboardingRolloutId === scopedReleaseId),
  });
  // First steps (URG-293), read once for the page so phone and computer agree
  // on whether the card is up (Oct 17, 2026 just-planned cuts). While it is up
  // (or still loading on a new rollout) the pinned date card is its step 1
  // instead of a second card, and the distribution check and the role gaps
  // wait until it is done or hidden.
  const firstSteps = useRolloutFirstSteps({
    release: scopedReleaseSlim
      ? {
          id: scopedReleaseSlim.id,
          createdAt: scopedReleaseSlim.createdAt ?? null,
          isTest: Boolean(scopedReleaseSlim.isTest),
        }
      : null,
    isOwner: scopedReleaseIsOwn,
    pinnedConfirmDate: pinnedConfirmDateTask
      ? { title: pinnedConfirmDateTask.title, onOpen: () => openTask(pinnedConfirmDateTask.id) }
      : null,
  });
  const firstStepsUp = Boolean(
    bodyIsMainView && scopedReleaseSlim && !scopedReleaseSlim.isTest && firstSteps.status !== 'hidden'
  );
  // Renders nothing unless there is genuinely something to say, the
  // PostPlanKitPrompt rule verbatim.
  //
  // Both halves of one loop, in the order they happen: the jobs nobody is on,
  // then what came back from the people already asked. The second is why the
  // request row stores its release at all, and each renders nothing when it
  // has nothing to say, so a release with neither adds no chrome.
  //
  // The role gaps wait while first steps is up (Oct 17, 2026): a people ask
  // beside step "Invite your team" is the same ask twice. Back next visit.
  const roleGapsFooter =
    scopedReleaseSlim && ((roleGaps.length > 0 && !firstStepsUp) || DIRECTORY_REQUESTS_ENABLED) ? (
      <div className="space-y-3">
        {roleGaps.length > 0 && !firstStepsUp ? (
          <RoleGapsPanel releaseId={scopedReleaseSlim.id} gaps={roleGaps} />
        ) : null}
        {DIRECTORY_REQUESTS_ENABLED && scopedReleaseIsOwn ? (
          <SentRequestsList releaseId={scopedReleaseSlim.id} variant="release" />
        ) : null}
      </div>
    ) : null;

  const pinnedConfirmDateCard = pinnedConfirmDateTask && !firstStepsUp ? (
    <PinnedConfirmDateCard
      title={pinnedConfirmDateTask.title}
      dueDate={pinnedConfirmDateTask.dueDate ?? null}
      onOpen={() => openTask(pinnedConfirmDateTask.id)}
    />
  ) : null;

  // Any scoped release without a date gets the card at the top of its
  // activity list (URG-230). It reports its own success through the existing
  // workspace toast and unmounts on its own once the store reports a date.
  const setReleaseDateBanner =
    !planBanner && scopedReleaseSlim && scopedReleaseIsOwn && !scopedReleaseSlim.releaseDate ? (
      <SetReleaseDateCard
        releaseId={scopedReleaseSlim.id}
        releaseTitle={scopedReleaseSlim.title}
        templatePending={scopedReleaseSlim.templatePending}
        releaseType={scopedReleaseSlim.releaseType}
        onSaved={(message) => setToast({ message, tone: 'success' })}
        onAddActivity={() =>
          openQuickCreate({ releaseId: scopedReleaseSlim.id, source: 'inline' })
        }
      />
    ) : null;

  // The one banner the activity list carries, with the pinned activity above
  // it for a new user. Null when there is neither, so the panel renders no gap.
  const otherActivitiesBanner =
    editorialPitchBanner ?? testReleaseBanner ?? planBanner ?? setReleaseDateBanner;
  // The post-release review (URG-253) leads the list once it opens: 28 days
  // after release day, or every activity done. Checked here from the store
  // first, so a rollout still in flight never fetches it.
  const releaseReviewCard =
    scopedReleaseSlim &&
    isReviewDue(
      { releaseDate: scopedReleaseSlim.releaseDate },
      scopedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate,
        completedAt: task.completedAt,
      }))
    ) ? (
      <ReleaseReview
        key={scopedReleaseSlim.id}
        releaseId={scopedReleaseSlim.id}
        artistId={scopedReleaseSlim.artistId ?? null}
      />
    ) : null;
  const bannerParts = [releaseReviewCard, pinnedConfirmDateCard, otherActivitiesBanner].filter(Boolean);
  const activitiesBannerNode =
    bannerParts.length > 1 ? (
      <div className="space-y-3">
        {bannerParts.map((part, index) => (
          <Fragment key={index}>{part}</Fragment>
        ))}
      </div>
    ) : (
      (bannerParts[0] ?? null)
    );

  // Only a card that explains the empty list AND offers a way to act on it
  // replaces the generic empty state; the compact date row does neither, so a
  // view under it still needs TasksPanel's own (URG-233). The planner card does
  // both, always.
  const bannerReplacesEmptyState = Boolean(
    planBanner || (setReleaseDateBanner && scopedReleaseSlim?.templatePending)
  );

  // The open release scene's body, handed to TasksPanel so it replaces the
  // activity buckets in place, while the rollout menu in the right-hand column
  // (RolloutMenuPortal, below) stays put and lights the open scene. Null unless
  // the URL names a scene AND the release resolved — same guard the panels use.
  // Handed to ONE branch only (isDesktopViewport below): both layout branches
  // are always in the DOM, and giving this node to both mounted every scene
  // twice — the calendar double-fetched everything on every open.
  //
  // The timeline is the exception, and deliberately: it renders BARE, without
  // ReleaseScenePanel's header. That header carries a "Timeline for <release>"
  // title and a "Back to Activities" control, both of which are wrong on the
  // view a release LANDS on — there is nothing to go back from, and the
  // release header directly above already names the release. The buckets have
  // always rendered chromeless for the same reason.
  // Full screen (2026-10-07). The mode is keyed to the rollout it was opened on
  // and to the timeline being the body, so switching rollout or tab ends it with
  // no effect to reset it. The timeline mounts ONCE: while the overlay is up the
  // panel slot holds an empty placeholder rather than a second copy.
  // Desktop opens the timeline full screen (founder, 2026-10-11: "anytime a
  // user enters into the timeline view let it always start in full screen for
  // desktop"). Fires once per entry: keyed to the rollout and to the timeline
  // being the body, so "Exit full screen" sticks until they leave the timeline
  // (another tab or rollout) and come back. Phones keep the inline timeline.
  //
  // Not before there is a plan (founder, 2026-10-14): a rollout with no
  // activities opened onto a blank full-screen timeline that hid the planner
  // card, the one thing to do there. It stays inline until activities exist,
  // and opens full screen the moment the plan lands.
  //
  // URG-277 / URG-295 (2026-10-15): "Exit full screen" must STICK for the whole
  // visit. The entry key used to fold the viewport and the plan check into
  // itself, so anything that briefly flipped either (a forced refetch emptying
  // the task list for a frame, the window resized across lg) reset the key and
  // threw the person straight back into full screen right after they left it,
  // which is the "exit breaks in the plan builder" report. Now the visit is the
  // rollout plus the timeline being the body, and only leaving THAT resets it;
  // the viewport and the plan only decide whether the one automatic open has
  // happened yet.
  const timelineHasPlan = scopedTasks.length > 0;
  const timelineVisitKey =
    panelBody === 'timeline' && scopedReleaseSlim?.id ? scopedReleaseSlim.id : null;
  const autoFullKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (timelineVisitKey === null) {
      autoFullKeyRef.current = null;
      return;
    }
    if (autoFullKeyRef.current === timelineVisitKey) return;
    if (!(isDesktopViewport && timelineHasPlan)) return;
    autoFullKeyRef.current = timelineVisitKey;
    setTimelineFullFor(timelineVisitKey);
  }, [timelineVisitKey, isDesktopViewport, timelineHasPlan]);
  const timelineIsFull =
    timelineHasPlan &&
    timelineFullFor !== null &&
    timelineFullFor === scopedReleaseSlim?.id &&
    panelBody === 'timeline';
  // The check before distribution, shown on the rollout itself (brief 2). Only
  // while the main view is showing: inside a scene
  // the person is already working, and the Distribute scene carries the same
  // list. Its Fix buttons for the title, the release day and the artist open the
  // dialogs this component owns, and only for the owner, because both edits are
  // owner-only and a Fix button that can only fail is worse than none.
  //
  // Not on an empty shell (2026-10-09): a rollout with no release day and no
  // activities yet has nothing to distribute, and opening one with a red
  // "Fix these" banner reads as an error before anything was done. The
  // planner card or the date card is the next step there; the strip shows up
  // as soon as either a date or an activity exists.
  //
  // Not the readiness list on a Released rollout (v1.92.5): "Fix these before
  // you order distribution" under a header that says Released contradicted
  // it. The rule is distributionStripMode, which reads the same displayStatus
  // as the Catalogue row and the focused header, so the three always agree. A
  // distributor's answer still shows there; archived is unchanged.
  const distributionMode = scopedReleaseSlim
    ? distributionStripMode({
        status: scopedReleaseSlim.status ?? '',
        releaseDate: scopedReleaseSlim.releaseDate ?? null,
        tasksDone: scopedTasks.filter((task) => task.status === 'done').length,
        tasksTotal: scopedTasks.length,
      })
    : 'none';
  const distributionStatusStrip =
    // Waits while first steps is up (Oct 17, 2026): distribution is weeks away
    // and its top item (cover art) is first step 1, so the page asked twice.
    bodyIsMainView && scopedReleaseSlim && distributionMode !== 'none' && !firstStepsUp ? (
      <DistributionStatusStrip
        releaseId={scopedReleaseSlim.id}
        showReadiness={distributionMode === 'full'}
        compact={isDesktopViewport && panelBody === 'timeline'}
        row={!isDesktopViewport && panelBody === 'timeline'}
        onOpenDetails={scopedReleaseIsOwn ? () => setIsDetailsOpen(true) : undefined}
        onChangeArtist={changeArtistAction ? changeArtistAction.onClick : undefined}
      />
    ) : null;

  const timelineScene =
    panelBody === 'timeline' && scopedReleaseSlim ? (
      <TimelineScene
        release={scopedReleaseSlim}
        tasks={scopedTasks}
        onOpenTask={openTask}
        onToast={(message, tone) => setToast({ message, tone })}
        onRescheduled={() => void loadCommandCenter({ force: true })}
        suppressEmptyState={bannerReplacesEmptyState}
        statusSlot={isDesktopViewport ? distributionStatusStrip : undefined}
        phone={!isDesktopViewport && !timelineIsFull}
        onFullScreen={
          timelineIsFull || !timelineHasPlan
            ? undefined
            : () => setTimelineFullFor(scopedReleaseSlim.id)
        }
      />
    ) : null;
  const scenePanel =
    timelineScene ? (
      timelineIsFull ? (
        <div aria-hidden="true" />
      ) : (
        timelineScene
      )
    ) : panelBody !== 'activities' && scopedReleaseSlim ? (
      <ReleaseScenePanel
        scene={panelBody}
        release={scopedReleaseSlim}
        onClose={closeScene}
        onToast={(message, tone) => setToast({ message, tone })}
        tasks={scopedTasks}
        onOpenTask={openTask}
        onTaskRescheduled={() => void loadCommandCenter({ force: true })}
        onOpenDetails={scopedReleaseIsOwn ? () => setIsDetailsOpen(true) : undefined}
        onChangeArtist={changeArtistAction ? changeArtistAction.onClick : undefined}
      />
    ) : undefined;

  // Suppressed while the release has no date: this guide opens with "Your
  // release is set up" and describes a rollout that, for a dateless
  // template release, has not been built yet (URG-230). The date card above
  // is the honest version of the same moment, and stacking both would put
  // two banners over one empty list. The rollout tour offer card that used to
  // take this slot first was removed Oct 17, 2026 (founder: "this is not
  // needed at all"); the tour code is kept.
  const newReleaseGuideBanner =
    showNewReleaseGuide && !setReleaseDateBanner && !planBanner && !planBuiltFresh ? (
      <NewReleaseGuide
        onDismiss={() => setShowNewReleaseGuide(false)}
        releaseType={scopedReleaseSlim?.releaseType}
      />
    ) : null;

  // Next moves (URG-259): up to three one-tap cards on the main view, worked
  // out from this rollout and its activities. Mounted ONCE: in the full-screen
  // timeline while that is up, otherwise in the one layout branch on screen.
  //
  // First steps (URG-293): on a NEW rollout the owner gets one obvious next
  // action (the cover art, the details, invite the team) with a short
  // checklist, and it stands in for the next moves until every step is done or
  // it is hidden, so a fresh rollout offers one thing to do rather than four.
  const nextMovesBanner =
    bodyIsMainView && scopedReleaseSlim && !scopedReleaseSlim.isTest ? (
      <RolloutFirstSteps
        state={firstSteps}
        fallback={
          <RolloutNextMoves release={scopedReleaseSlim} tasks={scopedTasks} isOwner={scopedReleaseIsOwn} />
        }
      />
    ) : null;

  const handleSelect = (releaseId: string) => {
    const nextScope = scopedReleaseId === releaseId ? null : releaseId;
    const stacked =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 1023px)').matches;

    // Mobile drill-in (no scope → scope) pushes a history entry so the
    // browser back button returns the user to Level 1. Desktop clicks and
    // mobile deselects stay on `replace` — desktop is filter-like (no nav
    // noise), and a mobile deselect via tapping the same card is a no-op
    // path that shouldn't grow history either.
    const isMobileDrillIn = stacked && nextScope !== null;
    setScope(nextScope, isMobileDrillIn ? { push: true } : undefined);

    // On mobile drill-in, the Level 2 content (back header → TasksPanel)
    // becomes the new screen. Scroll the page to the top so the back
    // affordance is the first thing the user sees, instead of landing
    // wherever they were in the releases list.
    if (isMobileDrillIn) {
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    }
  };

  // THE BACK ARROW. ONE destination: the catalog. It leaves the release —
  // scene open or not, however the user got here — and that is all it does.
  //
  // This REPLACES the history-aware rule of 2026-08-25 (close the scene first,
  // otherwise the previous in-app URL from lib/nav-history, otherwise drop the
  // scope), which the founder rejected on 2026-08-30: "this back button is
  // failing again … clicking home while in task view should lead them to
  // catalog view, same thing for that back button, always." Two reasons worth
  // keeping, so nobody rebuilds the clever version:
  //
  //   * IT LIVES IN THE RELEASE HEADER, beside the release title and above the
  //     scene tabs. Its position already says "leave this release"; the tabs
  //     are what manage the inside of one. A control whose destination depends
  //     on invisible state reads as broken even when each individual case is
  //     defensible — and several were genuinely not the catalog: the previous
  //     location could be another release, UrgAns, Notes or Settings, and a
  //     trail 20 deep drops the catalog off the bottom entirely. That is the
  //     unpredictability being reported, not a single reproducible case.
  //   * BROWSER BACK AND THE EDGE SWIPE ALREADY DO HISTORY. Duplicating them
  //     in a chrome button bought nothing and made both feel unreliable.
  //
  // Closing a scene without leaving the release is still a tap: every scene's
  // own entry point is a toggle (the lit row in the rollout menu, on a phone
  // and on a desktop alike), and each scene carries its own back control.
  //
  // Still NOT router.back(), for the reason it never was: a legacy-route
  // redirect can make a scene URL the FIRST history entry in a tab, so back()
  // would eject the user out of the app entirely. Recorded at
  // useSceneOverlay.closeScene, and the stub it names is real
  // (app/dashboard/releases/[releaseId]/page.tsx). Nothing in this app calls
  // router.back() anywhere.
  //
  // `forgetScene` is what stops this looping — see SetScopeOptions. Without it
  // backing out of, say, Cover art records Cover art as where the release was
  // left, so tapping that release again drops the user straight back into the
  // scene they just walked out of.
  //
  // `replace`, the hook's default: leaving is a return to the at-rest view, not
  // a forward move, and desktop deselects must not grow history with duplicate
  // catalog entries.
  const goBack = () => {
    // Reports `nav_stalled` if the address has not changed 1.5s from now, so a
    // back tap that looks dead (PostHog rage clicks, 2026-10-03) says whether
    // the router was slow or stuck. Does nothing to the click itself.
    watchNavigationStall('release_back_arrow', '/dashboard');
    // The fifth "leave this release for the catalog" surface. It does not call
    // leaveReleaseForCatalog(), because setScope's `forgetScene` already does
    // the scene half properly (it knows the OUTGOING release without re-reading
    // the url) — but the intent half is the same fact, and recording it is what
    // keeps this exit from being undone by the lone-release auto-scope on the
    // next mount or refresh.
    markCatalogRequested();
    setScope(null, { forgetScene: true });
  };

  const handleMobileBack = () => {
    goBack();
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  // What the arrow SAYS, matched to what it does. It had two behaviours between
  // 2026-08-25 and 2026-08-30 and so had to settle for a vague "Back"; with one
  // destination the specific label is true again, in every state, which is what
  // a screen reader needs. A constant also keeps this out of the class of bugs
  // where a label is derived from storage during render and disagrees between
  // the server and the client.
  const backLabel = 'Back to all rollouts';

  // ONE skeleton, rendered here (not as a route-segment Suspense fallback).
  // SSR serializes the skeleton into the HTML response; hydration re-renders
  // the SAME JSX so React reconciles without a remount — no shimmer restart,
  // no blank gap between route fallback and content. The skeleton stays
  // visible until both auth resolves AND the first command-center fetch
  // completes.
  // The third condition holds the skeleton for the one frame between the first
  // load resolving and the auto-scope effect committing. Effects run after
  // paint, so without it a single-release workspace flashes the one-card
  // catalog on the way to its activities — the exact view this is meant to
  // never show. Staying on the skeleton reads as "still settling" instead.
  // Gated on `!hasAutoScopedRef.current` (not just `isSingleRelease &&
  // !scopedReleaseId`): once the one auto-scope has already happened, a null
  // scope means the user deliberately backed out via the catalog button, not
  // that the initial auto-scope hasn't landed yet — that case must render
  // the real catalog, not an eternal skeleton.
  // `!catalogRequested` is the same rule for a deliberate exit made from a
  // DIFFERENT page, which remounts this component and so arrives with a fresh
  // ref. Without it, Home from Settings held the skeleton for a frame and then
  // painted the release the user was trying to leave.
  if (
    authLoading ||
    isInitialLoading ||
    (isSingleRelease && !scopedReleaseId && !catalogRequested && !hasAutoScopedRef.current)
  ) {
    return <WorkspaceSkeleton />;
  }

  const scopeAnnouncement = scopedReleaseSlim
    ? `Showing activities for ${scopedReleaseSlim.title}`
    : 'Showing all activities';

  // NO min-h-screen here (founder call, 2026-07-23): this main renders
  // INSIDE AppShell's already-full-height column, ~85px below the top, so a
  // full-screen minimum pushed every page 125px past the viewport — a
  // permanent scrollbar even when three releases fit comfortably. The app
  // shell paints the background; this main sizes to its content.
  // `flex min-h-full flex-col` below lg (2026-08-14) is the height chain that
  // lets TasksPanel's mobile pill dock actually reach the bottom of the screen.
  // `position: sticky` alone can't do it: it only pins once the containing
  // block overflows the viewport, and every activity bucket starts COLLAPSED —
  // so on a normal load the dock would sit right under a short list, floating
  // mid-screen. That is the exact failure the founder rejected by screenshot
  // when the Calendar pill was tried as a sticky element inside this list
  // (2026-08-13, attempt 3), and `position: fixed` is not an escape: the
  // `.lazy-fade` class on AppShell's `.app-layout` carries a non-`none`
  // transform, which makes it the containing block for fixed descendants (and
  // only outside `prefers-reduced-motion`, so it would break for some users and
  // not others).
  //
  // So the height is propagated instead, with no magic numbers: AppShell's
  // <main> is a stretched flex item inside a `min-h-screen` column, so it has a
  // definite height, `min-h-full` resolves against it, and `flex-1` carries the
  // remainder down through the wrapper -> the mobile branch -> TasksPanel's
  // aside (whose own `flex-1` was inert below lg until now) -> its scrolling
  // body. The dock, as the aside's last child, lands on the viewport floor when
  // content is short and stays sticky when it isn't.
  //
  // `min-h-` (not `h-`) is load-bearing: a hard height would clip a long
  // activity list instead of letting the page grow. At lg+ every one of these
  // reverts to the block layout the desktop views have always assumed.
  return (
    <div className="flex min-h-full flex-col text-content-primary lg:block">
      {/* The catalog has no visible page title, so it would have no top-level
          heading at all. A scoped rollout is named by the topbar and its own
          header, so this is only for the catalog at rest. */}
      {!scopedReleaseId ? <h1 className="sr-only">Your rollouts</h1> : null}
      {/* Mobile gutter comes from AppShell's <main> (px-4). Layering another
          px-4 here on mobile compounded to 32px each side, eating content
          area on phones where TasksPanel fills the screen full-width. The
          container's own padding now kicks in at sm+ where the workspace is
          a desktop layout that actually wants the extra inset.
          The outer page width is owned by AppShell's mx-auto max-w-[1440px]
          wrapper — see AppShell.tsx PAGE WIDTH SOURCE OF TRUTH. This div
          intentionally has NO max-width so dashboard / settings can't drift
          apart again. */}
      {/* Bottom padding is slimmer below sm — AppShell's <main> already
          carries pb-28 there for dock clearance, and the doubled-up 208px
          made even a one-release catalog scroll on phones. */}
      {/* The UrgAns side rail used to be this div's flex sibling; it now
          rides beside AppShell's <main> instead (URG-210), so this is a
          plain content wrapper again. */}
      {/* lg:pt-0 (2026-08-05, URG-224 + URG-226): at lg+, this wrapper's own
          pt-6 stacked on top of <main>'s shared pt-5, pushing the release grid
          44px below WorkspaceIdentityPanel and RightRail. Both of those
          are flex siblings of <main> pinned at `sticky top-[calc(5.25rem+1px)]`
          = 85px, which is exactly the topbar (65px) PLUS main's pt-5 (20px) —
          i.e. they align to main's PADDED content top, not to the topbar. So
          only this wrapper's own pt-6 should go; main's pt-5 must stay.
          URG-224 also carried `lg:-mt-5`, which cancelled that pt-5 too and
          overshot the cards 20px ABOVE the panels (measured on production:
          cards at 65px vs panels at 85px). Removing it lands all three on 85px.
          Below lg neither panel renders, so the normal pt-6 inset stays. Do NOT
          touch AppShell's <main> padding directly — Settings and every other
          chrome page share it, and the panels' sticky offset is derived from
          it. */}
      {/* lg:px-0 (2026-08-06, URG-231): below lg this wrapper's sm:px-6 is the
          workspace's own gutter, but at lg+ it stacked on <main>'s lg:px-8 and
          indented the workspace 24px further than every other page — and cost
          the release grid 48px of width it needed to reach 4 columns. Dropping
          it at lg+ lines the grid area up with the same content edge the topbar
          uses. Keep WorkspaceSkeleton's wrapper identical (URG-228). */}
      {/* `flex min-h-0 flex-1 flex-col lg:block` — link two of the height chain
          described above <main>; inert at lg+.
          The bottom padding drops to 0 below lg while a release is scoped
          (2026-08-14): the mobile pill dock is the last thing in that view and
          already sits above AppShell's own bottom clearance, so this padding
          would only push the dock up off the floor — by 24px on a phone and 96px
          at `sm`, where it would visibly float. The catalog view keeps it. */}
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col pt-6 sm:px-6 lg:block lg:px-0 lg:pt-0 ${isDesktopFocusedMode ? 'pb-0 lg:pb-0' : 'pb-6 sm:pb-24'}`}
      >
          {/* Screen-reader-only live region. Polite mode waits for the SR to be
              idle, atomic="true" re-reads the whole message. Mirrors the visible
              workspace state so SR users get the same context. */}
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {scopeAnnouncement}
          </div>

          {timelineIsFull && timelineScene && scopedReleaseSlim ? (
            <TimelineFullScreen
              title={`Timeline for ${scopedReleaseSlim.title || 'this rollout'}`}
              onClose={() => setTimelineFullFor(null)}
            >
              {/* The page's own toast sits behind the overlay, so a failed
                  reschedule would be invisible. Shown here too while it is up. */}
              {toast ? (
                <div className="mt-4" role={toast.tone === 'success' ? 'status' : 'alert'}>
                  <Toast message={toast.message} tone={toast.tone} />
                </div>
              ) : null}
              <div className="mt-4">{nextMovesBanner}</div>
              {pinnedConfirmDateCard ? <div className="mb-3 mt-3">{pinnedConfirmDateCard}</div> : null}
              {timelineScene}
            </TimelineFullScreen>
          ) : null}

          {error ? (
            <div role="alert" className="mb-6 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          {toast ? (
            // A failure is announced at once (alert); a confirmation politely.
            <div className="mb-6" role={toast.tone === 'success' ? 'status' : 'alert'}>
              <Toast message={toast.message} tone={toast.tone} />
            </div>
          ) : null}

          {showCatalogue ? (
            <CatalogueView
              rows={catalogueRows}
              onOpen={handleSelect}
              onCreate={() => setIsCreateModalOpen(true)}
              testRelease={testReleaseEntry}
            />
          ) : (
            <>
          {/* ====================================================================
              MOBILE (< lg): drill-down. Level 1 shows the release list; Level 2
              shows back header + TasksPanel for the scoped release (Files and
              Calendar are now their own pages, linked from TasksPanel's header
              — see URG-165). Behavior matches the pre-centered-focus
              implementation.
              ==================================================================== */}
          {/* Final link of the height chain (see <main> above): this column
              stretches to the viewport floor so TasksPanel's aside — and with
              it the pill dock at the aside's base — has somewhere to reach. */}
          <div className="flex min-h-0 flex-1 flex-col lg:hidden">
            {scopedReleaseId && scopedReleaseSlim ? (
              <>
                {/* The decluttered phone header (rollout declutter, founder
                    approved Oct 18, 2026): bare back chevron (always
                    rendered, so even a one-rollout team can get out), artist
                    eyebrow and serif title, search and menu icons, then ONE
                    meta line with the page's one count. The MOTION bar and
                    the phase line's second count are gone from the phone; the
                    phase counts live in Work the plan and on the computer.
                    The check before distribution is one divider row on the
                    timeline, right under the meta line. */}
                <RolloutPhoneHeader
                  artistId={scopedReleaseSlim.artistId}
                  artistName={scopedReleaseSlim.artistName}
                  title={scopedReleaseSlim.title}
                  releaseDate={scopedReleaseSlim.releaseDate}
                  done={scopedTasks.filter((t) => t.status === 'done').length}
                  total={scopedTasks.length}
                  backLabel={backLabel}
                  onBack={handleMobileBack}
                  showMeta={bodyIsMainView}
                  showSearch={panelBody === 'timeline' && scopedTasks.length > 0}
                  below={
                    <>
                      {isDesktopViewport ? null : distributionStatusStrip}
                      {newReleaseGuideBanner}
                      {isDesktopViewport || timelineIsFull ? null : nextMovesBanner}
                    </>
                  }
                />
                <TasksPanel
                  id={TASKS_PANEL_ID}
                  tasks={scopedTasks}
                  scopedRelease={scopedReleaseSlim}
                  archiveAction={archiveAction}
                  changeArtistAction={changeArtistAction}
                  shareAction={shareAction}
                  sceneContent={isDesktopViewport ? undefined : scenePanel}
                  pageBarTools={false}
                  activitiesBanner={activitiesBannerNode}
                  activitiesFooter={roleGapsFooter}
                  bannerReplacesEmptyState={bannerReplacesEmptyState}
                />
                {/* The per-release files surface lives inside TasksPanel as an
                    inline collapsible segment at the top of the task area,
                    toggled from the "Files" button in that panel's header.
                    Both mobile and desktop reach it via the same control;
                    consolidating to one surface ensures the two can't drift
                    apart. */}
              </>
            ) : null}
          </div>

          {/* ====================================================================
              DESKTOP (≥ lg): centered focus. At rest the whole main area is a
              release grid (Option A). On select, the non-selected cards split
              into LEFT + RIGHT rails and the selected release sits centered
              above its TasksPanel. This REPLACES the legacy two-pane (3fr/2fr)
              desktop layout — the old grid wrapper has been removed entirely.
              ==================================================================== */}
          <div className="hidden lg:block">
            {isDesktopFocusedMode && selectedCard && scopedReleaseSlim ? (
              <WorkspaceDesktopFocused
                scopedTasks={scopedTasks}
                scopedRelease={scopedReleaseSlim}
                card={selectedCard}
                share={shareAction}
                changeArtist={changeArtistAction}
                archive={archiveAction}
                onClose={goBack}
                closeLabel={backLabel}
                // Only while the main view is showing, as the "New activity"
                // pill always was: a scene has taken the panel otherwise.
                onNewActivity={
                  bodyIsMainView
                    ? () => openQuickCreate({ releaseId: scopedReleaseSlim.id, source: 'inline' })
                    : undefined
                }
                banner={
                  <>
                    {newReleaseGuideBanner}
                    {isDesktopViewport && !timelineIsFull ? nextMovesBanner : null}
                    {/* On the timeline the strip sits on the phase row instead
                        (2026-10-16, founder: one compact line). */}
                    {isDesktopViewport && panelBody !== 'timeline' ? distributionStatusStrip : null}
                  </>
                }
                panelSceneContent={isDesktopViewport ? scenePanel : undefined}
                panelActivitiesBanner={activitiesBannerNode}
                panelActivitiesFooter={roleGapsFooter}
                panelBannerReplacesEmptyState={bannerReplacesEmptyState}
              />
            ) : null}
          </div>
            </>
          )}
      </div>

      <CreateReleaseModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onStartTestRelease={TEST_RELEASE_ENABLED ? startTestRelease : undefined}
        onCreated={(releaseId, plan, result) => {
          setIsCreateModalOpen(false);
          // CreateReleaseModal already force-resyncs the store on success;
          // this non-forced call piggybacks on that in-flight load (or the
          // recency guard) rather than fetching a second time.
          void loadCommandCenter();
          // First release ever (releases still empty at this point, since the
          // forced resync above hasn't landed) → stage the "first win" reveal
          // instead of navigating. The reveal handles navigation on dismiss.
          // With the planner on, a rollout-plan release is created with no
          // activities, so the "first win" reveal would celebrate an empty
          // list. The planner card is the honest version of that moment.
          const plannerPending = result?.plannerPending === true;

          // TYPE-FIRST CREATE (founder call, 2026-09-01): the type tap was
          // the whole form, so land straight in the release — no access step
          // (decision recorded in CLAUDE.md; Settings → Team still mints
          // logins), no first-win (it celebrates a plan a dateless release
          // doesn't have yet), no ?new=1 (the guide describes a built plan —
          // the date card + setup sheet are the honest version). The
          // plannerPending branch is kept for safety even though the two
          // flags are documented as incompatible.
          if (TYPE_FIRST_CREATE_ENABLED) {
            // The first-rollout share offer is saved for the next visit here
            // too, then the landing. See withFirstShareOffer.
            withFirstShareOffer({
              releaseId,
              firstRelease: result?.firstRelease,
              then: () => {
                router.push(`/dashboard?release=${releaseId}`);
                if (plannerPending) {
                  // Made just now for the planner: closing it early
                  // discards the empty rollout (lib/release-draft-discard.ts).
                  openIntake(
                    buildCreatedRolloutIntake({
                      releaseId,
                      savedTitle: result?.savedTitle,
                      releaseType: result?.releaseType,
                    })
                  );
                }
              },
            })();
            return;
          }

          // Everything this flow did before team logins existed, deferred into
          // one closure so the access step can run FIRST and then hand control
          // back untouched. Nothing below this line changed behaviour — the
          // three branches are verbatim.
          const resume = () => {
            if (FIRST_WIN_ENABLED && releases.length === 0 && !plannerPending) {
              setWinReleaseId(releaseId);
            } else if (plannerPending) {
              // Straight into the intake: planning is the whole point of having
              // chosen a rollout plan, and the release has nothing else in it.
              // The type picked in the modal rides along as a prefill so the
              // intake's own type question isn't asked a second time.
              router.push(`/dashboard?release=${releaseId}`);
              // Made just now for the planner: closing it early discards
              // the empty rollout (lib/release-draft-discard.ts).
              openIntake(
                buildCreatedRolloutIntake({
                  releaseId,
                  savedTitle: result?.savedTitle,
                  releaseType: result?.releaseType,
                })
              );
            } else {
              // ?new=1 triggers the one-time dismissible getting-started guide
              // (NewReleaseGuide) — only for TEMPLATE creations; its copy
              // describes the rollout plan a blank release doesn't have. Lands
              // on the workspace scoped to the new release (2026-08-04 — the
              // release detail page was removed; this IS the activity view now).
              router.push(
                plan === 'template'
                  ? `/dashboard?release=${releaseId}&new=1`
                  : `/dashboard?release=${releaseId}`
              );
            }
          };

          // Share to socials (founder request, 2026-09-23): after the person's
          // FIRST rollout, the once-only share offer is saved for the next
          // visit (2026-10-13; it used to open here, before the planner, which
          // was too early) and `resume` runs straight away.
          const continueAfterAccess = withFirstShareOffer({
            releaseId,
            firstRelease: result?.firstRelease,
            then: resume,
          });

          // The compulsory "get your team in" step (founder request,
          // 2026-08-16) goes BEFORE any of it, including the first-win reveal
          // and the planner intake: a login the manager can send is the first
          // thing a new release should produce. It generates the link itself
          // and calls resume() on its single exit, so with the flag off this
          // whole block is one boolean and the original path runs unchanged.
          if (TEAM_LOGINS_ENABLED) {
            setAccessStep({ releaseId, title: result?.title ?? null, resume: continueAfterAccess });
            return;
          }
          continueAfterAccess();
        }}
      />

      {/* Rendered before FirstReleaseWin so that when both are staged, the
          access step is what the user sees — it clears itself and then calls
          resume(), which is what stages the reveal. */}
      {accessStep ? (
        <ReleaseAccessStep
          releaseId={accessStep.releaseId}
          releaseTitle={accessStep.title}
          onDone={() => {
            const { resume } = accessStep;
            setAccessStep(null);
            resume();
          }}
        />
      ) : null}

      {winReleaseId ? (
        <FirstReleaseWin
          releaseId={winReleaseId}
          onDone={() => {
            const target = winReleaseId;
            setWinReleaseId(null);
            router.push(`/dashboard?release=${target}`);
          }}
        />
      ) : null}

      {isDetailsOpen && scopedReleaseSlim ? (
        <ReleaseDetailsSheet
          releaseId={scopedReleaseSlim.id}
          releaseTitle={scopedReleaseSlim.title}
          releaseDate={scopedReleaseSlim.releaseDate ?? null}
          onDismiss={() => setIsDetailsOpen(false)}
          onSaved={(message) => {
            setIsDetailsOpen(false);
            setToast({ message, tone: 'success' });
          }}
        />
      ) : null}

      {/* The type-first setup nudge. Success reports through the same
          workspace toast the date card uses; dismissal is quiet — the
          undismissable SetReleaseDateCard in the panel stays as the
          persistent path to the same two fields. */}
      {setupPrompt.open && scopedReleaseSlim ? (
        <ReleaseSetupSheet
          releaseId={scopedReleaseSlim.id}
          releaseTitle={scopedReleaseSlim.title}
          releaseType={scopedReleaseSlim.releaseType}
          onDismiss={setupPrompt.dismiss}
          onSaved={(message) => {
            setToast({ message, tone: 'success' });
            setupPrompt.dismiss();
          }}
        />
      ) : null}

      <ArchiveReleaseDialog
        open={isArchiveOpen}
        release={scopedReleaseSlim}
        archived={isScopedArchived}
        onClose={() => setIsArchiveOpen(false)}
        onArchived={(_releaseId, archived) => {
          setIsArchiveOpen(false);
          setToast({
            message: archived ? 'Rollout archived.' : 'Rollout restored.',
            tone: 'success',
          });
          // Force-refresh so the catalog grid and the identity card's active
          // count both reflect it without a reload.
          void loadCommandCenter({ force: true });
        }}
      />

      {/* The test path's delete exit — DeleteReleaseDialog's second-ever
          mount (the first is Settings' ReleasesSection). Deleting REAL
          releases stays Settings-only per URG-163; this dialog only ever
          holds a test release, set by TestReleaseBanner's button. The
          dialog owns the DELETE fetch itself. */}
      <DeleteReleaseDialog
        open={testReleaseToDelete !== null}
        release={testReleaseToDelete}
        onClose={() => setTestReleaseToDelete(null)}
        onDeleted={(releaseId) => {
          setTestReleaseToDelete(null);
          // Same pair Settings' handler runs: drop the release locally now,
          // then resync so counts, rails and the identity card agree with
          // the server.
          removeReleaseLocal(releaseId);
          void loadCommandCenter({ force: true });
          // Land on the catalog and STAY there. Without the intent mark, a
          // remaining lone REAL release would auto-scope-bounce the user
          // straight back into a release seconds after they deleted one —
          // the v1.14.1 mechanism. forgetScene clears the deleted release's
          // remembered scene on the way out.
          markCatalogRequested();
          setScope(null, { forgetScene: true });
          setToast({ message: 'Test rollout deleted.', tone: 'success' });
        }}
      />

      <ChangeReleaseArtistDialog
        open={isChangeArtistOpen}
        release={scopedReleaseSlim}
        onClose={() => setIsChangeArtistOpen(false)}
        onChanged={(_releaseId, artistName) => {
          setIsChangeArtistOpen(false);
          setToast({ message: `Moved to ${artistName}.`, tone: 'success' });
          // Force-refresh: the release card, the scoped header and the identity
          // card's artist line all read the cached name, so without this they
          // keep showing the old artist until a reload.
          void loadCommandCenter({ force: true });
        }}
      />

      {/* One mount for BOTH entry points into release.draft_plan — the
          one-tap card above and the refine modal's own fire-and-forget
          submit (mounted separately by AppShell) both write to the same
          store field on a plan_required refusal. See PlannerLockedRefusal's
          own comment for why this can't just be local state. */}
      <UrgansLockedSheet
        open={Boolean(lockedRefusal)}
        message={lockedRefusal?.message || ''}
        actionType={lockedRefusal?.actionType || 'release.draft_plan'}
        onClose={() => setLockedRefusal(null)}
      />
    </div>
  );
}
