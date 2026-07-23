'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Plus } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { type Task } from '@/lib/tasks';
import type { Release } from '@/types/releases';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { createPostHogEvent } from '@/lib/analytics/shared';
import { WorkspaceSkeleton } from '@/components/loading/WorkspaceSkeleton';
import { FeatureUpsellCard } from '@/components/shared/FeatureUpsellCard';
import { FirstReleaseWin } from './FirstReleaseWin';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { TaskDetailInline, useTaskUI } from '@/components/tasks/TaskUIProvider';
import { ReleasesColumn, type ReleaseCardData } from './ReleasesColumn';
import { TasksPanel } from './TasksPanel';
import { WorkspaceDesktopGrid } from './WorkspaceDesktopGrid';
import { WorkspaceDesktopFocused } from './WorkspaceDesktopFocused';
import { useReleaseScope } from './useReleaseScope';

const TASKS_PANEL_ID = 'workspace-tasks';

// Feature flag — when 'true', a new user's FIRST release creation triggers the
// "first win" reveal (URG-107) instead of navigating straight to the release.
// Inlined at build time. Off in prod until validated.
const FIRST_WIN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FIRST_WIN === 'true';

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
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, catalogViewEntitled, isInitialLoading, error, loadCommandCenter } =
    useReleaseStore();
  const tasks = useTaskStore((state) => state.tasks);
  const { scopedReleaseId, setScope } = useReleaseScope();
  // `isTaskOpen` swaps the workspace center (mobile drill-down OR desktop
  // focused-mode center column) from the task list to TaskDetailInline. The
  // rails / focused release card stay visible — only the list↔detail surface
  // swaps. Notification clicks set `?release=` then call openTask, so this
  // observes the same flag they all flow through.
  const { isTaskOpen, closeTask } = useTaskUI();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  // Set to the new release's id when a first-release "win" reveal should show.
  const [winReleaseId, setWinReleaseId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, router, user]);

  // URG-178: landing on the workspace without the roster entitlement IS the
  // "reached for the catalog" moment — there's no nav item to click, the
  // grid just doesn't render. Fires once per load (the flag only flips when
  // a command-center payload lands), mirroring ChappiPageClient/
  // FilesPageClient's on-surface pattern.
  useEffect(() => {
    if (!isInitialLoading && !catalogViewEntitled) {
      captureAnalyticsEvent(
        createPostHogEvent('gated_feature_attempted', {
          flag: 'catalogView',
          surface: 'workspace_roster',
        })
      );
    }
  }, [isInitialLoading, catalogViewEntitled]);

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

  const scopedReleaseSlim = useMemo<Pick<Release, 'id' | 'title' | 'artistName'> | null>(() => {
    if (!scopedReleaseId) return null;
    const found = releases.find((r) => r.id === scopedReleaseId);
    if (!found) return null;
    return { id: found.id, title: found.title, artistName: found.artistName };
  }, [scopedReleaseId, releases]);

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

  const handleSelect = (releaseId: string) => {
    // An open task detail belongs to the outgoing scope. Close it before the
    // scope changes — otherwise the center column keeps showing the old
    // task (rail clicks appear to do nothing) and, on deselect, `isTaskOpen`
    // makes the detail take over the main area instead of the release grid.
    if (isTaskOpen) closeTask();
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
    // Same invariant as handleSelect: clearing scope must land on the
    // release grid, so any open task detail closes with it.
    if (isTaskOpen) closeTask();
    // Replace-not-push so desktop deselects don't grow history with a
    // duplicate at-rest entry. Matches the mobile back affordance below.
    setScope(null);
  };

  const handleMobileBack = () => {
    if (isTaskOpen) closeTask();
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
    ? `Showing tasks for ${scopedReleaseSlim.title}`
    : 'Showing all tasks';

  // ====================================================================
  // URG-178 free tier: the task feature only. No roster grid on desktop,
  // no releases list on mobile — the roster-wide catalog view is paid
  // (the server already stripped its data from the payload; this branch
  // just draws the matching layout). Release creation stays (it's core),
  // task detail opens in place, and an inline upsell explains what the
  // roster view adds instead of a dead surface.
  // ====================================================================
  if (!catalogViewEntitled) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="pb-24 pt-6 sm:px-6">
          <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {scopeAnnouncement}
          </div>

          {error ? (
            <div className="mb-6 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          <div className="mx-auto max-w-3xl space-y-6">
            {isTaskOpen ? (
              <TaskDetailInline />
            ) : (
              <>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    New release
                  </button>
                </div>
                <TasksPanel
                  id={TASKS_PANEL_ID}
                  tasks={scopedTasks}
                  scopedRelease={scopedReleaseSlim}
                  onClearScope={handleClose}
                />
                <FeatureUpsellCard
                  title="See your whole roster at a glance"
                  body="Upgrade to see all your releases side by side — status, dates, and progress for each — and jump between them as you work."
                />
              </>
            )}
          </div>
        </div>

        <CreateReleaseModal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={(releaseId) => {
            setIsCreateModalOpen(false);
            void loadCommandCenter();
            if (FIRST_WIN_ENABLED && releases.length === 0) {
              setWinReleaseId(releaseId);
            } else {
              router.push(`/dashboard/releases/${releaseId}`);
            }
          }}
        />

        {winReleaseId ? (
          <FirstReleaseWin
            releaseId={winReleaseId}
            onDone={() => {
              const target = winReleaseId;
              setWinReleaseId(null);
              router.push(`/dashboard/releases/${target}`);
            }}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      {/* Mobile gutter comes from AppShell's <main> (px-4). Layering another
          px-4 here on mobile compounded to 32px each side, eating content
          area on phones where TasksPanel fills the screen full-width. The
          container's own padding now kicks in at sm+ where the workspace is
          a desktop layout that actually wants the extra inset.
          The outer page width is owned by AppShell's mx-auto max-w-[1440px]
          wrapper — see AppShell.tsx PAGE WIDTH SOURCE OF TRUTH. This div
          intentionally has NO max-width so dashboard / settings can't drift
          apart again. */}
      <div className="pb-24 pt-6 sm:px-6">
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

        {/* ====================================================================
            MOBILE (< lg): drill-down. Level 1 shows the release list; Level 2
            shows back header + TasksPanel for the scoped release (Files and
            Calendar are now their own pages, linked from TasksPanel's header
            — see URG-165). Behavior matches the pre-centered-focus
            implementation — this block is intentionally unchanged.
            ==================================================================== */}
        <div className="lg:hidden">
          {isTaskOpen ? (
            // Mobile Level 3: task detail in place. Drills one level deeper
            // than the tasks list. Back inside TaskDetailInline closes the
            // task and returns to Level 2 (tasks list for the scoped
            // release) — or Level 1 (releases) if no scope is set.
            <TaskDetailInline />
          ) : scopedReleaseId && scopedReleaseSlim ? (
            <>
              <div className="mb-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleMobileBack}
                  aria-label="Back to releases"
                  className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
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
              <TasksPanel
                id={TASKS_PANEL_ID}
                tasks={scopedTasks}
                scopedRelease={scopedReleaseSlim}
                onClearScope={handleMobileBack}
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
              selected={selectedCard}
              leftRail={leftRail}
              rightRail={rightRail}
              scopedTasks={scopedTasks}
              scopedRelease={scopedReleaseSlim}
              onSelect={handleSelect}
              onClose={handleClose}
              isTaskOpen={isTaskOpen}
            />
          ) : isTaskOpen ? (
            // Edge case: task opened while unscoped (e.g. notification with
            // no taskReleaseId, or task opened then scope cleared). With no
            // selected release there's no centered focus card to anchor to,
            // so the detail takes over the main area entirely. Back returns
            // to the grid.
            <TaskDetailInline />
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
        onCreated={(releaseId) => {
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
            router.push(`/dashboard/releases/${releaseId}`);
          }
        }}
      />

      {winReleaseId ? (
        <FirstReleaseWin
          releaseId={winReleaseId}
          onDone={() => {
            const target = winReleaseId;
            setWinReleaseId(null);
            router.push(`/dashboard/releases/${target}`);
          }}
        />
      ) : null}
    </main>
  );
}
