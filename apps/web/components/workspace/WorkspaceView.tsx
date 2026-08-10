'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { AlertCircle, ArrowLeft, PartyPopper, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { useChappiStore } from '@/stores/useChappiStore';
import { type Task } from '@/lib/tasks';
import type { Release } from '@/types/releases';
import { supabase } from '@/lib/supabase/client';
import { type ReleaseContext } from '@/lib/release-tailoring';
import { Toast } from '@/components/shared/Toast';
import { NewReleaseGuide } from '@/components/releases/NewReleaseGuide';
import { SetReleaseDateCard } from '@/components/releases/SetReleaseDateCard';
import { WorkspaceSkeleton } from '@/components/loading/WorkspaceSkeleton';
import { FirstReleaseWin } from './FirstReleaseWin';
import { ReleasesColumn, type ReleaseCardData } from './ReleasesColumn';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { TasksPanel } from './TasksPanel';
import { useSceneOverlay } from './useSceneOverlay';
import { useScenePrefetch } from './useScenePrefetch';
import { ReleaseScenePanel } from '@/components/releases/ReleaseScenePanel';
import { WorkspaceDesktopGrid } from './WorkspaceDesktopGrid';
import { WorkspaceDesktopFocused } from './WorkspaceDesktopFocused';
import { useReleaseScope } from './useReleaseScope';

const TASKS_PANEL_ID = 'workspace-tasks';

// Feature flag — when 'true', a new user's FIRST release creation triggers the
// "first win" reveal (URG-107) instead of navigating straight to the release.
// Inlined at build time. Off in prod until validated.
const FIRST_WIN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FIRST_WIN === 'true';

// Same flag AppTopbar/ChappiDock read. The UrgAns side rail itself is
// mounted by AppShell now (URG-210 — it rides every chrome page, not just
// the catalog); this view only needs the flag to gate its rail-aware
// behaviors (hideRails + the scope live-sync below).
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// Ported from the removed release detail page (2026-08-04, founder call):
// both AI features stay hidden until the gateway is wired to a capable
// model. NEXT_PUBLIC_ prefix so the value is inlined at build time; the API
// routes guard the same flags server-side.
const TAILOR_PLAN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TAILOR_PLAN === 'true';
const STATUS_UPDATE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_STATUS_UPDATE === 'true';

// The shareable end-of-release card. Unlike the two AI actions above, this pill
// is also gated on the release actually being finished, so it appears at the
// moment there is something to celebrate rather than sitting there all campaign.
const RELEASE_RECAP_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_RECAP === 'true';

// Dynamic for the same reason AppShell already loads it that way — a static
// import here defeated that, dragging the ~460-line modal into the /dashboard
// entry chunk that every user downloads before first paint, for a surface
// most sessions never open.
const CreateReleaseModal = dynamic(
  () => import('@/components/releases/CreateReleaseModal').then((m) => m.CreateReleaseModal),
  { ssr: false }
);

// Dynamic + flag-gated, same rationale as the removed page: while a flag is
// off — as both are in production today — the modal's chunk is never
// requested at all.
const TailorPlanModal = dynamic(
  () => import('@/components/releases/TailorPlanModal').then((m) => m.TailorPlanModal),
  { ssr: false }
);
const StatusUpdateModal = dynamic(
  () => import('@/components/releases/StatusUpdateModal').then((m) => m.StatusUpdateModal),
  { ssr: false }
);
const RecapModal = dynamic(
  () => import('@/components/releases/RecapModal').then((m) => m.RecapModal),
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
  const { releases, isInitialLoading, error, loadCommandCenter } = useReleaseStore();
  const tasks = useTaskStore((state) => state.tasks);
  const { scopedReleaseId, setScope } = useReleaseScope();
  // Which release scene (if any) the URL has open. It renders INLINE in the
  // activity slot rather than as an overlay (founder call, 2026-08-05: "like
  // the way UrgAns is on the side but in the place where activity lists
  // appear"), so this view has to know about it to build the panel body and to
  // give the calendar its width.
  const { activeScene, closeScene } = useSceneOverlay();
  // Warm the scoped release's four scenes during idle time, so the pills in
  // TasksPanel's header open instantly instead of each costing a round trip.
  // Skipped entirely on Data Saver / 2g — see useScenePrefetch.
  useScenePrefetch(scopedReleaseId, !isInitialLoading);
  // Same global quick-create TasksPanel's header pill opens — the date card's
  // "add an activity yourself" action routes here so both entry points land
  // in one modal (URG-233).
  const { openQuickCreate } = useTaskUI();
  const isRailOpen = useChappiStore((state) => state.railOpen);
  // Task detail renders as a global pop-up mounted by TaskUIProvider
  // (2026-07-23) — this view no longer swaps its layout when a task opens.
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Set to the new release's id when a first-release "win" reveal should show.
  const [winReleaseId, setWinReleaseId] = useState<string | null>(null);

  // AI actions + toast, ported verbatim from the removed release detail page
  // (2026-08-04) — this is now the only surface a scoped release renders on.
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isTailorOpen, setIsTailorOpen] = useState(false);
  const [savedContext, setSavedContext] = useState<ReleaseContext | null>(null);
  const [hasTailoring, setHasTailoring] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);
  const [isGeneratingStatus, setIsGeneratingStatus] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState('');
  // One-time getting-started guide (NewReleaseGuide), triggered by ?new=1
  // alongside ?release= from the create flows. Read into state once, then
  // both params are stripped via router.replace so a refresh never
  // re-triggers it — the guide's own visibility is controlled purely by
  // this boolean from then on (dismiss just flips it false, no URL churn).
  const [showNewReleaseGuide, setShowNewReleaseGuide] = useState(false);
  useEffect(() => {
    if (searchParams.get('new') !== '1' || !scopedReleaseId) return;
    setShowNewReleaseGuide(true);
    router.replace(`/dashboard?release=${scopedReleaseId}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount to consume the param; router/searchParams identity churn shouldn't re-fire this.
  }, []);

  // Fire the dashboard fetch IMMEDIATELY, without waiting on the auth store.
  // loadCommandCenter reads its own bearer token from supabase.auth.getSession()
  // (a local storage read), so it doesn't need the auth store's server-verified
  // profile — gating it behind authLoading serialized it after the GoTrue
  // getUser round trip for no benefit. With no session it returns silently and
  // the effect below redirects.
  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

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

  const generateStatus = async () => {
    if (!scopedReleaseId) return;
    setIsStatusOpen(true);
    setIsGeneratingStatus(true);
    setStatusUpdate('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');
      const res = await fetch(`/api/releases/${scopedReleaseId}/generate-status`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        status_update?: string;
        error?: string;
      };
      if (!res.ok || !payload.status_update) {
        throw new Error(payload.error || 'Could not generate status update.');
      }
      setStatusUpdate(payload.status_update);
    } catch (err) {
      setIsStatusOpen(false);
      setToast({
        tone: 'error',
        message: err instanceof Error ? err.message : 'Could not generate status update.',
      });
    } finally {
      setIsGeneratingStatus(false);
    }
  };

  // Load any prior tailoring so the button label and modal pre-fill reflect
  // it, whenever the scoped release changes.
  useEffect(() => {
    setSavedContext(null);
    setHasTailoring(false);
    if (!TAILOR_PLAN_ENABLED || authLoading || !user || !scopedReleaseId) return;
    let cancelled = false;
    const loadTailoring = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/releases/${scopedReleaseId}/tailor-plan`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as {
          context?: ReleaseContext | null;
          has_tailoring?: boolean;
        };
        if (cancelled) return;
        setSavedContext(data.context ?? null);
        setHasTailoring(Boolean(data.has_tailoring));
      } catch {
        // Non-blocking: the button just defaults to "Tailor plan".
      }
    };
    void loadTailoring();
    return () => {
      cancelled = true;
    };
  }, [authLoading, scopedReleaseId, user]);

  useEffect(() => {
    if (!toast) return;
    const dismissAfterMs = toast.tone === 'warning' ? 6000 : 2600;
    const timeout = window.setTimeout(() => setToast(null), dismissAfterMs);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // Live-sync the assistant's scoped release to the catalog's open release
  // WHILE the rail is open. The deps array IS the transition detector:
  // opening the rail fires this immediately (including `null` = "All
  // releases"); changing/clearing the catalog selection while open fires it
  // again; a manual pick inside ChappiScopePicker only touches the store
  // (no dep here changes), so it holds until the next catalog transition.
  // Runs below lg too if railOpen lingers there — harmless, and consistent
  // with the mobile "carry once at navigation" behavior in AppTopbar.
  useEffect(() => {
    if (!CHAPPI_ENABLED || !isRailOpen) return;
    useChappiStore.getState().setScopedReleaseId(scopedReleaseId);
  }, [isRailOpen, scopedReleaseId]);

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
      };
    });
  }, [releases, taskList]);

  // `releaseDate` is here for the content calendar scene (it resolves the
  // default month from the release date) and for SetReleaseDateCard's
  // show/hide condition; `templatePending` picks that card's variant
  // (URG-230). The panels that only need id/title/artistName accept this
  // wider shape structurally.
  const scopedReleaseSlim = useMemo<Pick<
    Release,
    'id' | 'title' | 'artistName' | 'releaseDate' | 'templatePending' | 'status'
  > | null>(() => {
    if (!scopedReleaseId) return null;
    const found = releases.find((r) => r.id === scopedReleaseId);
    if (!found) return null;
    return {
      id: found.id,
      title: found.title,
      artistName: found.artistName,
      releaseDate: found.releaseDate,
      templatePending: found.templatePending,
      status: found.status,
    };
  }, [scopedReleaseId, releases]);

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

  // Centered-focus split: take the non-selected releases in grid order and
  // slice them into left + right rails. Ceiling on the left, floor on the
  // right, per spec — same release always lands on the same side across
  // reselects because the underlying releaseCards order doesn't change with
  // the selection. `selectedCard` is the centered focus card; null when
  // the URL points at a release that doesn't exist in this user's data
  // (stale link, deleted release) and we fall back to the grid below.
  const { selectedCard, leftRail, rightRail } = useMemo(() => {
    if (!scopedReleaseId) {
      return { selectedCard: null as ReleaseCardData | null, leftRail: [], rightRail: [] };
    }
    const selected = releaseCards.find((c) => c.release.id === scopedReleaseId) ?? null;
    if (!selected) {
      return { selectedCard: null as ReleaseCardData | null, leftRail: [], rightRail: [] };
    }
    const nonSelected = releaseCards.filter((c) => c.release.id !== scopedReleaseId);
    const leftCount = Math.ceil(nonSelected.length / 2);
    return {
      selectedCard: selected,
      leftRail: nonSelected.slice(0, leftCount),
      rightRail: nonSelected.slice(leftCount),
    };
  }, [releaseCards, scopedReleaseId]);

  // Desktop focused mode is gated on BOTH the URL scope and a successful
  // lookup. URL pointing at a stale release id → fall back to the grid
  // (and clear the param so back-button doesn't trap the user). Mobile
  // path uses `scopedReleaseSlim` directly for the same reason.
  const isDesktopFocusedMode = Boolean(scopedReleaseId && selectedCard);

  // The open release scene's body, handed to TasksPanel so it replaces the
  // activity buckets in place while the pill row above stays put. Null unless
  // the URL names a scene AND the release resolved — same guard the panels use.
  const scenePanel =
    activeScene && scopedReleaseSlim ? (
      <ReleaseScenePanel
        scene={activeScene}
        release={scopedReleaseSlim}
        onClose={closeScene}
        onToast={(message, tone) => setToast({ message, tone })}
      />
    ) : undefined;

  // The content calendar's month grid is built for ~1200px and swaps to its
  // agenda list on a VIEWPORT-gated breakpoint, so it needs the release rails
  // out of the way to have room — the same treatment the UrgAns rail already
  // triggers. The other three scenes fit the normal centre column, so they
  // leave the rails alone (founder call).
  const hideRailsForLayout = (CHAPPI_ENABLED && isRailOpen) || activeScene === 'calendar';

  // A recap is only worth offering once the release has actually happened.
  // Mirrors the server predicate in the recap route's _shared.ts exactly, so
  // the pill and the API can never disagree about what "finished" means.
  // Release day itself counts: the share moment is the launch, not the day
  // after. The all-tasks-done clause is what makes "complete" real today, since
  // nothing in the product writes the released status, and it is the only route
  // to a recap for a release whose date was never set.
  const isRecapEligible = useMemo(() => {
    if (!scopedReleaseSlim) return false;
    if (scopedReleaseSlim.status === 'released' || scopedReleaseSlim.status === 'archived') {
      return true;
    }
    if (scopedReleaseSlim.releaseDate) {
      const releaseDay = new Date(`${scopedReleaseSlim.releaseDate}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (Number.isFinite(releaseDay.getTime()) && releaseDay.getTime() <= today.getTime()) {
        return true;
      }
    }
    return scopedTasks.length > 0 && scopedTasks.every((task) => task.status === 'done');
  }, [scopedReleaseSlim, scopedTasks]);

  // The two AI action pills, ported from the removed release detail page —
  // only meaningful (and only rendered) when a release is scoped, so both
  // TasksPanel mounts get this via `extraActions` only in that case.
  const taskPanelExtraActions = scopedReleaseId ? (
    <>
      {TAILOR_PLAN_ENABLED ? (
        <button
          type="button"
          onClick={() => setIsTailorOpen(true)}
          className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {hasTailoring ? 'Re-tailor plan' : 'Tailor plan'}
        </button>
      ) : null}
      {STATUS_UPDATE_ENABLED ? (
        <button
          type="button"
          onClick={() => void generateStatus()}
          disabled={isGeneratingStatus}
          className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {isGeneratingStatus ? 'Generating…' : 'Generate status update'}
        </button>
      ) : null}
      {RELEASE_RECAP_ENABLED && isRecapEligible ? (
        <button
          type="button"
          onClick={() => setIsRecapOpen(true)}
          className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover"
        >
          <PartyPopper className="h-3.5 w-3.5" aria-hidden="true" />
          Get your release recap
        </button>
      ) : null}
    </>
  ) : null;

  // Any scoped release without a date gets the card at the top of its
  // activity list (URG-230). It reports its own success through the existing
  // workspace toast and unmounts on its own once the store reports a date.
  const setReleaseDateBanner =
    scopedReleaseSlim && !scopedReleaseSlim.releaseDate ? (
      <SetReleaseDateCard
        releaseId={scopedReleaseSlim.id}
        releaseTitle={scopedReleaseSlim.title}
        templatePending={scopedReleaseSlim.templatePending}
        onSaved={(message) => setToast({ message, tone: 'success' })}
        onAddActivity={() =>
          openQuickCreate({ releaseId: scopedReleaseSlim.id, source: 'inline' })
        }
      />
    ) : null;

  // Only the plan-waiting card explains the empty list and offers a way to
  // act on it; the compact date row does neither, so a view under it still
  // needs TasksPanel's own empty state (URG-233).
  const bannerReplacesEmptyState = Boolean(
    setReleaseDateBanner && scopedReleaseSlim?.templatePending
  );

  // Suppressed while the release has no date: this guide opens with "Your
  // release is set up" and describes a rollout that, for a dateless
  // template release, has not been built yet (URG-230). The date card above
  // is the honest version of the same moment, and stacking both would put
  // two banners over one empty list.
  const newReleaseGuideBanner =
    showNewReleaseGuide && !setReleaseDateBanner ? (
      <NewReleaseGuide onDismiss={() => setShowNewReleaseGuide(false)} />
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

  const handleClose = () => {
    // Replace-not-push so desktop deselects don't grow history with a
    // duplicate at-rest entry. Matches the mobile back affordance below.
    setScope(null);
  };

  const handleMobileBack = () => {
    setScope(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  // ONE skeleton, rendered here (not as a route-segment Suspense fallback).
  // SSR serializes the skeleton into the HTML response; hydration re-renders
  // the SAME JSX so React reconciles without a remount — no shimmer restart,
  // no blank gap between route fallback and content. The skeleton stays
  // visible until both auth resolves AND the first command-center fetch
  // completes.
  if (authLoading || isInitialLoading) {
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
  return (
    <main className="bg-bg-base text-content-primary">
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
          44px below WorkspaceIdentityPanel and ChappiSidePanel. Both of those
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
      <div
        className={`min-w-0 pt-6 sm:px-6 lg:px-0 lg:pt-0 ${isDesktopFocusedMode ? 'pb-6 sm:pb-24 lg:pb-0' : 'pb-6 sm:pb-24'}`}
      >
          {/* Screen-reader-only live region. Polite mode waits for the SR to be
              idle, atomic="true" re-reads the whole message. Mirrors the visible
              workspace state so SR users get the same context. */}
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {scopeAnnouncement}
          </div>

          {error ? (
            <div className="mb-6 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          {toast ? (
            <div className="mb-6">
              <Toast message={toast.message} tone={toast.tone} />
            </div>
          ) : null}

          {/* ====================================================================
              MOBILE (< lg): drill-down. Level 1 shows the release list; Level 2
              shows back header + TasksPanel for the scoped release (Files and
              Calendar are now their own pages, linked from TasksPanel's header
              — see URG-165). Behavior matches the pre-centered-focus
              implementation — this block is intentionally unchanged.
              ==================================================================== */}
          <div className="lg:hidden">
            {scopedReleaseId && scopedReleaseSlim ? (
              <>
                <div className="mb-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleMobileBack}
                    aria-label="Back to releases"
                    className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                      {scopedReleaseSlim.artistName || 'Unassigned artist'}
                    </p>
                    <h2 className="truncate font-display text-lg font-semibold leading-tight text-content-primary">
                      {scopedReleaseSlim.title}
                    </h2>
                  </div>
                </div>
                {/* Motion tracker — same strip the desktop focused view carries
                    in its top row, so mobile shows release progress too.
                    Track uses stroke-strong (2026-08-04, founder contrast
                    fix) — bg-bg-elevated was a materials/layering token, not
                    a meter-track color, and read as nearly invisible against
                    the surrounding background in both themes (byte-identical
                    to bg-surface in light mode). stroke-strong is the theme-
                    flipped foreground color at 10% opacity, so it scales its
                    visibility with whatever it sits on instead of matching
                    it. Bar bumped h-1 -> h-1.5 for perceptual presence. */}
                <div className="mb-4 flex items-center gap-3">
                  <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
                    Motion
                  </span>
                  <div className="h-1.5 min-w-0 flex-1 rounded-full bg-stroke-strong" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-300"
                      style={{
                        width: `${
                          scopedTasks.length > 0
                            ? Math.round(
                                (scopedTasks.filter((t) => t.status === 'done').length /
                                  scopedTasks.length) *
                                  100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[11px] font-semibold text-content-primary">
                    {scopedTasks.filter((t) => t.status === 'done').length}/{scopedTasks.length}
                  </span>
                </div>
                {newReleaseGuideBanner}
                <TasksPanel
                  id={TASKS_PANEL_ID}
                  tasks={scopedTasks}
                  scopedRelease={scopedReleaseSlim}
                  extraActions={taskPanelExtraActions}
                  sceneContent={scenePanel}
                  activitiesBanner={setReleaseDateBanner}
                  bannerReplacesEmptyState={bannerReplacesEmptyState}
                />
                {/* The per-release files surface lives inside TasksPanel as an
                    inline collapsible segment at the top of the task area,
                    toggled from the "Files" button in that panel's header.
                    Both mobile and desktop reach it via the same control;
                    consolidating to one surface ensures the two can't drift
                    apart. */}
              </>
            ) : (
              <ReleasesColumn
                releases={releaseCards}
                scopedReleaseId={scopedReleaseId}
                onSelect={handleSelect}
                onCreateRelease={() => setIsCreateModalOpen(true)}
              />
            )}
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
                leftRail={leftRail}
                rightRail={rightRail}
                scopedTasks={scopedTasks}
                scopedRelease={scopedReleaseSlim}
                onSelect={handleSelect}
                onClose={handleClose}
                hideRails={hideRailsForLayout}
                banner={newReleaseGuideBanner}
                panelExtraActions={taskPanelExtraActions}
                panelSceneContent={scenePanel}
                panelActivitiesBanner={setReleaseDateBanner}
                panelBannerReplacesEmptyState={bannerReplacesEmptyState}
              />
            ) : (
              <WorkspaceDesktopGrid
                releases={releaseCards}
                onSelect={handleSelect}
                onCreateRelease={() => setIsCreateModalOpen(true)}
              />
            )}
          </div>
      </div>

      <CreateReleaseModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(releaseId, plan) => {
          setIsCreateModalOpen(false);
          // CreateReleaseModal already force-resyncs the store on success;
          // this non-forced call piggybacks on that in-flight load (or the
          // recency guard) rather than fetching a second time.
          void loadCommandCenter();
          // First release ever (releases still empty at this point, since the
          // forced resync above hasn't landed) → stage the "first win" reveal
          // instead of navigating. The reveal handles navigation on dismiss.
          if (FIRST_WIN_ENABLED && releases.length === 0) {
            setWinReleaseId(releaseId);
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
        }}
      />

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

      {TAILOR_PLAN_ENABLED && scopedReleaseId ? (
        <TailorPlanModal
          open={isTailorOpen}
          releaseId={scopedReleaseId}
          initialContext={savedContext}
          onClose={() => setIsTailorOpen(false)}
          onTailored={(result, context) => {
            setHasTailoring(true);
            setSavedContext(context);
            setToast({
              tone: 'success',
              message: `Plan tailored: ${result.tasks_removed} removed, ${result.tasks_modified} updated`,
            });
            void loadCommandCenter({ force: true });
          }}
        />
      ) : null}

      {STATUS_UPDATE_ENABLED ? (
        <StatusUpdateModal
          open={isStatusOpen}
          isGenerating={isGeneratingStatus}
          statusUpdate={statusUpdate}
          onClose={() => setIsStatusOpen(false)}
          onRegenerate={() => void generateStatus()}
        />
      ) : null}

      {/* Mounted only while open, so each open refetches and never shows a
          signed preview URL that expired since last time. */}
      {RELEASE_RECAP_ENABLED && isRecapOpen && scopedReleaseSlim ? (
        <RecapModal
          releaseId={scopedReleaseSlim.id}
          releaseTitle={scopedReleaseSlim.title}
          onClose={() => setIsRecapOpen(false)}
          onToast={(message, tone) => setToast({ message, tone })}
        />
      ) : null}
    </main>
  );
}
