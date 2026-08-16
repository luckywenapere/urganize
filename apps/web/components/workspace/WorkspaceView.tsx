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
import type { StatusFacts } from '@/lib/release-status';
import type { Release } from '@/types/releases';
import { supabase } from '@/lib/supabase/client';
import { Toast } from '@/components/shared/Toast';
import { NewReleaseGuide } from '@/components/releases/NewReleaseGuide';
import { ReleaseAccessStep } from '@/components/releases/ReleaseAccessStep';
import { SetReleaseDateCard } from '@/components/releases/SetReleaseDateCard';
import { WorkspaceSkeleton } from '@/components/loading/WorkspaceSkeleton';
import { FirstReleaseWin } from './FirstReleaseWin';
import { useFirstReleaseRequired } from '@/components/releases/useFirstReleaseRequired';
import { ReleasesColumn, type ReleaseCardData } from './ReleasesColumn';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { TasksPanel, taskPanelPillClass } from './TasksPanel';
import { useSceneOverlay } from './useSceneOverlay';
import { useScenePrefetch } from './useScenePrefetch';
import { useIsDesktopViewport } from './useIsDesktopViewport';
import { ReleaseScenePanel } from '@/components/releases/ReleaseScenePanel';
import { WorkspaceDesktopGrid } from './WorkspaceDesktopGrid';
import { WorkspaceDesktopFocused } from './WorkspaceDesktopFocused';
import { useReleaseScope } from './useReleaseScope';
import { usePlannerStore } from '@/stores/usePlannerStore';
import { PlanReleaseCard } from '@/components/planner/PlanReleaseCard';

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
// stays hidden until the gateway is wired to a capable model. NEXT_PUBLIC_
// prefix so the value is inlined at build time; the API route guards the same
// flag server-side.
const STATUS_UPDATE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_STATUS_UPDATE === 'true';

// The shareable end-of-release card. Unlike the two AI actions above, this pill
// is also gated on the release actually being finished, so it appears at the
// moment there is something to celebrate rather than sitting there all campaign.
const RELEASE_RECAP_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_RECAP === 'true';

// The UrgAns planner. When on, a release with no activities shows the planner
// card as its whole empty state, and the Plan pill joins the scene switcher
// until a plan is approved. Supersedes the immediate-apply tailor-plan feature,
// which mutated real task rows the moment the model answered.
const PLANNER_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_PLANNER === 'true';

// Same flag TasksPanel reads for its Calendar pill. The scene URL param has to
// be gated on it too: with the flag off, a stale `?scene=calendar` bookmark
// used to render the calendar island shell around a permanently failing fetch
// (its API routes 404 when off) instead of the normal activity list.
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
const CAPTURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true';

// Team logins (2026-08-16). Gates ONLY the compulsory post-create step here;
// the mint endpoint behind it is the pre-existing, ungated invite-link route.
const TEAM_LOGINS_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TEAM_LOGINS === 'true';

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
  const { activeScene: urlScene, openScene, closeScene } = useSceneOverlay();
  // Flag-gate the calendar scene at the one place the URL is resolved: with
  // the flag off the param is treated as no-scene, matching the pill (which
  // never renders) and the API routes (which 404).
  const activeScene =
    (urlScene === 'calendar' && !CONTENT_CALENDAR_ENABLED) ||
    (urlScene === 'capture' && !CAPTURE_ENABLED)
      ? null
      : urlScene;
  // Which of the two always-in-the-DOM layout branches (mobile drill-down /
  // desktop focused) should receive side-effectful children — see the hook.
  const isDesktopViewport = useIsDesktopViewport();
  // Warm the scoped release's four scenes during idle time, so the pills in
  // TasksPanel's header open instantly instead of each costing a round trip.
  // Skipped entirely on Data Saver / 2g — see useScenePrefetch.
  useScenePrefetch(scopedReleaseId, !isInitialLoading);
  // Same global quick-create TasksPanel's header pill opens — the date card's
  // "add an activity yourself" action routes here so both entry points land
  // in one modal (URG-233).
  const { openQuickCreate } = useTaskUI();
  const isRailOpen = useChappiStore((state) => state.railOpen);
  // The intake modal is mounted once by AppShell; this opens it.
  const openIntake = usePlannerStore((state) => state.openIntake);
  // True between firing the generate call and it returning, so the card and the
  // scene can both say UrgAns is working rather than showing an empty plan.
  const isPlanGenerating = usePlannerStore((state) =>
    scopedReleaseId ? state.generatingReleaseIds.includes(scopedReleaseId) : false
  );
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

  // AI actions + toast, ported verbatim from the removed release detail page
  // (2026-08-04) — this is now the only surface a scoped release renders on.
  const [toast, setToast] = useState<ToastState | null>(null);
  // Does the scoped release already have a draft plan waiting? One scoped
  // fetch, the same shape the tailor-plan context load had, because both the
  // planner card's wording and the Plan pill's visibility depend on it.
  const [hasPlanDraft, setHasPlanDraft] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);
  const [isGeneratingStatus, setIsGeneratingStatus] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState('');
  // The counts behind the generated paragraph, shown as tiles above it so the
  // narration can be checked against its own source data.
  const [statusStats, setStatusStats] = useState<StatusFacts | null>(null);
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
  useEffect(() => {
    // Wait for the first load: `releases` is empty until it lands, and acting
    // on that would look like zero releases rather than one.
    if (isInitialLoading || !isSingleRelease || scopedReleaseId) return;
    // `replace`, the hook's default — an auto-scope the user never asked for
    // must not become a history entry they have to press Back through, and
    // Back from here should leave the workspace, not restore a catalog this
    // release count has no route to.
    setScope(releases[0].id);
  }, [isInitialLoading, isSingleRelease, scopedReleaseId, releases, setScope]);

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

  // URG-217: a user with zero releases can't do anything here, so the create
  // modal opens itself and (in the modal) loses its exits until they create
  // one. Only fires once the store has CONFIRMED zero releases — the predicate
  // fails open while loading and on load errors, so a network blip can't wall
  // anyone off. Deleting your last release re-triggers this by design.
  const firstReleaseRequired = useFirstReleaseRequired();
  useEffect(() => {
    if (firstReleaseRequired) {
      setIsCreateModalOpen(true);
    }
  }, [firstReleaseRequired]);

  const generateStatus = async () => {
    if (!scopedReleaseId) return;
    setIsStatusOpen(true);
    setIsGeneratingStatus(true);
    setStatusUpdate('');
    setStatusStats(null);
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
        stats?: StatusFacts;
        error?: string;
      };
      if (!res.ok || !payload.status_update) {
        throw new Error(payload.error || 'Could not generate status update.');
      }
      setStatusUpdate(payload.status_update);
      // Absent on a response from a deploy that predates the stats field; the
      // modal simply renders no tiles rather than guessing at figures.
      setStatusStats(payload.stats ?? null);
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

  // Does the scoped release have a draft plan waiting? Asked whenever the
  // scope changes, and again when a generate call finishes, so the card stops
  // saying "let's plan this" the moment there is something to review.
  //
  // A single scoped fetch rather than a field on the command-center payload:
  // only the open release can show the card or the pill, so there is nothing to
  // gain from carrying the answer for every release in the catalog.
  useEffect(() => {
    setHasPlanDraft(false);
    if (!PLANNER_ENABLED || authLoading || !user || !scopedReleaseId) return;
    let cancelled = false;
    const loadPlanDraft = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/releases/${scopedReleaseId}/plan`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as {
          draft?: { status?: string } | null;
        };
        if (cancelled) return;
        setHasPlanDraft(data.draft?.status === 'draft');
      } catch {
        // Non-blocking: the card just offers to start a plan.
      }
    };
    void loadPlanDraft();
    return () => {
      cancelled = true;
    };
  }, [authLoading, scopedReleaseId, user, isPlanGenerating]);

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
    | 'id'
    | 'title'
    | 'artistName'
    | 'releaseType'
    | 'releaseDate'
    | 'templatePending'
    | 'status'
  > | null>(() => {
    if (!scopedReleaseId) return null;
    const found = releases.find((r) => r.id === scopedReleaseId);
    if (!found) return null;
    return {
      id: found.id,
      title: found.title,
      artistName: found.artistName,
      // Feeds the per-playbook runway copy in SetReleaseDateCard and
      // NewReleaseGuide, which would otherwise quote single's 8 weeks at an
      // album's 17.
      releaseType: found.releaseType,
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

  /** Open the intake for the scoped release. */
  const openPlanIntake = () => {
    if (!scopedReleaseId) return;
    openIntake({ source: 'empty_state', releaseId: scopedReleaseId });
  };

  // The open release scene's body, handed to TasksPanel so it replaces the
  // activity buckets in place while the pill row above stays put. Null unless
  // the URL names a scene AND the release resolved — same guard the panels use.
  // Handed to ONE branch only (isDesktopViewport below): both layout branches
  // are always in the DOM, and giving this node to both mounted every scene
  // twice — the calendar double-fetched everything on every open.
  const scenePanel =
    activeScene && scopedReleaseSlim ? (
      <ReleaseScenePanel
        scene={activeScene}
        release={scopedReleaseSlim}
        onClose={closeScene}
        onToast={(message, tone) => setToast({ message, tone })}
        existingTaskCount={scopedTasks.length}
        onPlanApproved={() => {
          setHasPlanDraft(false);
          closeScene();
          void loadCommandCenter({ force: true });
        }}
        onStartPlanIntake={() => openPlanIntake()}
      />
    ) : undefined;

  // The content calendar's month grid is built for ~1200px, so it gets the
  // release rails out of the way — the same treatment the UrgAns rail already
  // triggers. The grid↔agenda swap itself is container-width-based now
  // (cc-month-view/cc-agenda-view in globals.css), so a still-narrow column
  // (identity panel or rail open) degrades to the agenda instead of squeezing
  // the grid; hiding the rails here is what makes the grid the COMMON case at
  // lg+ rather than the lucky one. The other scenes fit the normal centre
  // column, so they leave the rails alone (founder call).
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
  //
  // Both now use `taskPanelPillClass` (TasksPanel's own neutral-pill class,
  // exported) instead of a hand-rolled copy: the copy had already drifted
  // (missing `shrink-0 whitespace-nowrap`) by the time this row grew to 9
  // pills on mobile, which combined with the two longest labels here to
  // wrap "Get your release recap" across three lines inside a fixed 32px
  // pill (2026-08-10 bug fix). Labels also shortened to match how a chip
  // row is supposed to read — one or two words, not a sentence; the icon
  // already carries the rest of the meaning (Sparkles = AI action,
  // PartyPopper = celebration).
  const taskPanelExtraActions = scopedReleaseId ? (
    <>
      {STATUS_UPDATE_ENABLED ? (
        <button
          type="button"
          onClick={() => void generateStatus()}
          disabled={isGeneratingStatus}
          className={`${taskPanelPillClass} disabled:opacity-60`}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          {isGeneratingStatus ? 'Generating…' : 'Status update'}
        </button>
      ) : null}
      {RELEASE_RECAP_ENABLED && isRecapEligible ? (
        <button type="button" onClick={() => setIsRecapOpen(true)} className={taskPanelPillClass}>
          <PartyPopper className="h-3.5 w-3.5" aria-hidden="true" />
          Release recap
        </button>
      ) : null}
    </>
  ) : null;

  // The Plan pill only exists while there is something to open: no activities
  // yet, or a draft already waiting. Once a plan is approved it disappears,
  // because from then on the activity list IS the plan.
  const showPlanPill = Boolean(
    PLANNER_ENABLED && scopedReleaseId && (scopedTasks.length === 0 || hasPlanDraft)
  );

  // With the planner on, a scoped release with no activities shows the planner
  // card as its ENTIRE body — no empty list under it, nothing above it. That is
  // what makes the main door impossible to miss.
  //
  // It also supersedes the plan-waiting date card for this case: that card asks
  // for a date so the template can be instantiated, and under the planner the
  // date is question three of the intake instead.
  const planBanner =
    PLANNER_ENABLED && scopedReleaseSlim && scopedTasks.length === 0 ? (
      <PlanReleaseCard
        hasDraft={hasPlanDraft}
        isGenerating={isPlanGenerating}
        onPlan={() => openPlanIntake()}
        onReview={() => openScene('plan', scopedReleaseSlim.id)}
        onAddActivity={() =>
          openQuickCreate({ releaseId: scopedReleaseSlim.id, source: 'inline' })
        }
      />
    ) : null;

  // Any scoped release without a date gets the card at the top of its
  // activity list (URG-230). It reports its own success through the existing
  // workspace toast and unmounts on its own once the store reports a date.
  const setReleaseDateBanner =
    !planBanner && scopedReleaseSlim && !scopedReleaseSlim.releaseDate ? (
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

  // Only a card that explains the empty list AND offers a way to act on it
  // replaces the generic empty state; the compact date row does neither, so a
  // view under it still needs TasksPanel's own (URG-233). The planner card does
  // both, always.
  const bannerReplacesEmptyState = Boolean(
    planBanner || (setReleaseDateBanner && scopedReleaseSlim?.templatePending)
  );

  // Suppressed while the release has no date: this guide opens with "Your
  // release is set up" and describes a rollout that, for a dateless
  // template release, has not been built yet (URG-230). The date card above
  // is the honest version of the same moment, and stacking both would put
  // two banners over one empty list.
  const newReleaseGuideBanner =
    showNewReleaseGuide && !setReleaseDateBanner && !planBanner ? (
      <NewReleaseGuide
        onDismiss={() => setShowNewReleaseGuide(false)}
        releaseType={scopedReleaseSlim?.releaseType}
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
  // The third condition holds the skeleton for the one frame between the first
  // load resolving and the auto-scope effect committing. Effects run after
  // paint, so without it a single-release workspace flashes the one-card
  // catalog on the way to its activities — the exact view this is meant to
  // never show. Staying on the skeleton reads as "still settling" instead.
  if (authLoading || isInitialLoading || (isSingleRelease && !scopedReleaseId)) {
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
    <main className="flex min-h-full flex-col bg-bg-base text-content-primary lg:block">
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
              implementation.
              ==================================================================== */}
          {/* Final link of the height chain (see <main> above): this column
              stretches to the viewport floor so TasksPanel's aside — and with
              it the pill dock at the aside's base — has somewhere to reach. */}
          <div className="flex min-h-0 flex-1 flex-col lg:hidden">
            {scopedReleaseId && scopedReleaseSlim ? (
              <>
                <div className="mb-4 flex items-center gap-3">
                  {/* No way back to a catalog that has nothing to choose from
                      — see isSingleRelease. Returns the moment a second
                      release exists. */}
                  {isSingleRelease ? null : (
                    <button
                      type="button"
                      onClick={handleMobileBack}
                      aria-label="Back to releases"
                      className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
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
                    it. Bar bumped h-1 -> h-1.5 for perceptual presence.
                    Hidden while a scene is open (2026-08-10): it describes
                    the ACTIVITY list, not the scene body that replaced it,
                    and on a phone it was one of ~250px of stacked chrome
                    between the topbar and the scene's own content. */}
                {activeScene ? null : (
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
                )}
                {newReleaseGuideBanner}
                <TasksPanel
                  id={TASKS_PANEL_ID}
                  tasks={scopedTasks}
                  scopedRelease={scopedReleaseSlim}
                  extraActions={taskPanelExtraActions}
                  sceneContent={isDesktopViewport ? undefined : scenePanel}
                  activitiesBanner={planBanner ?? setReleaseDateBanner}
                  bannerReplacesEmptyState={bannerReplacesEmptyState}
                  showPlanPill={showPlanPill}
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
                onClose={isSingleRelease ? undefined : handleClose}
                hideRails={hideRailsForLayout}
                banner={newReleaseGuideBanner}
                panelExtraActions={taskPanelExtraActions}
                panelSceneContent={isDesktopViewport ? scenePanel : undefined}
                panelActivitiesBanner={planBanner ?? setReleaseDateBanner}
                panelBannerReplacesEmptyState={bannerReplacesEmptyState}
                panelShowPlanPill={showPlanPill}
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
              router.push(`/dashboard?release=${releaseId}`);
              openIntake({ source: 'empty_state', releaseId });
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

          // The compulsory "get your team in" step (founder request,
          // 2026-08-16) goes BEFORE any of it, including the first-win reveal
          // and the planner intake: a login the manager can send is the first
          // thing a new release should produce. It generates the link itself
          // and calls resume() on its single exit, so with the flag off this
          // whole block is one boolean and the original path runs unchanged.
          if (TEAM_LOGINS_ENABLED) {
            setAccessStep({ releaseId, title: result?.title ?? null, resume });
            return;
          }
          resume();
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

      {STATUS_UPDATE_ENABLED ? (
        <StatusUpdateModal
          open={isStatusOpen}
          isGenerating={isGeneratingStatus}
          statusUpdate={statusUpdate}
          stats={statusStats}
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
