'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { type Task } from '@/lib/tasks';
import type { Release } from '@/types/releases';
import { WorkspaceSkeleton } from '@/components/loading/WorkspaceSkeleton';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { ReleasesColumn, type ReleaseCardData } from './ReleasesColumn';
import { TasksPanel } from './TasksPanel';
import { FilesPanel } from './FilesPanel';
import { useReleaseScope } from './useReleaseScope';

const TASKS_PANEL_ID = 'workspace-tasks';

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
  const { releases, isInitialLoading, error, loadCommandCenter } = useReleaseStore();
  const tasks = useTaskStore((state) => state.tasks);
  const { scopedReleaseId, setScope } = useReleaseScope();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, router, user]);

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

  const scopedRelease = useMemo<Pick<Release, 'id' | 'title' | 'artistName'> | null>(() => {
    if (!scopedReleaseId) return null;
    const found = releases.find((r) => r.id === scopedReleaseId);
    if (!found) return null;
    return { id: found.id, title: found.title, artistName: found.artistName };
  }, [scopedReleaseId, releases]);

  const scopedTasks = useMemo<Task[]>(() => {
    if (!scopedReleaseId) return taskList;
    return taskList.filter((task) => task.releaseId === scopedReleaseId);
  }, [scopedReleaseId, taskList]);

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

    // On mobile drill-in, the Level 2 content (back header → TasksPanel →
    // FilesPanel) becomes the new screen. Scroll the page to the top so
    // the back affordance is the first thing the user sees, instead of
    // landing wherever they were in the releases list.
    if (isMobileDrillIn) {
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    }
  };

  const handleMobileBack = () => {
    // App-back affordance on Level 2. `replace` (not push) so we don't
    // grow history with a duplicate L1 entry. Scroll to top so users land
    // at the top of the releases list rather than inheriting their L2
    // scroll position.
    setScope(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  if (authLoading || isInitialLoading) {
    return <WorkspaceSkeleton />;
  }

  const scopeAnnouncement = scopedRelease
    ? `Showing tasks for ${scopedRelease.title}`
    : 'Showing all tasks';

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      {/* Mobile gutter comes from AppShell's <main> (px-4). Layering another
          px-4 here on mobile compounded to 32px each side, eating content
          area on phones where TasksPanel fills the screen full-width. The
          container's own padding now kicks in at sm+ where the workspace is
          a two-pane desktop layout that actually wants the extra inset. */}
      <div className="mx-auto max-w-[1440px] pb-24 pt-6 sm:px-6">
        {/* Screen-reader-only live region. Polite mode waits for the SR to be
            idle, atomic="true" re-reads the whole message. Mirrors the visible
            ScopePill copy so SR users get the same context. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {scopeAnnouncement}
        </div>

        {error ? (
          <div className="mb-6 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {/*
          MOBILE (below lg): two-level drill-down driven by the `?release=`
          scope param. Level 1 (no scope) shows ONLY the releases list; Level
          2 (scope set) shows ONLY the tasks + files for that release plus a
          back header. The same components mount in both layouts — only the
          wrapper visibility flips. No mobile component fork.

          DESKTOP (lg+): unchanged two-pane grid. `lg:grid-cols-[3fr_2fr]`
          keeps the same column ratio; the `lg:block` overrides bring both
          columns back into view regardless of scope state.
        */}
        {/* `min-w-0` on both grid items is the canonical fix for grid
            "blowout": grid items default to min-width: auto, which means a
            single descendant with a wide min-content (a long unbreakable
            title, an image, a row whose truncate-chain breaks somewhere)
            forces the column wider than the viewport. min-w-0 lets the
            shrink-to-fit chain reach the column boundary instead of
            propagating overflow. */}
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className={`min-w-0 ${scopedReleaseId ? 'hidden lg:block' : 'block'}`}>
            <ReleasesColumn
              releases={releaseCards}
              scopedReleaseId={scopedReleaseId}
              onSelect={handleSelect}
              onCreateRelease={() => setIsCreateModalOpen(true)}
            />
          </div>

          {/* Right column stacks: mobile back/title header (mobile-only,
              scoped-only) → tasks panel → per-release files panel. No
              `space-y-*` here — FilesPanel (unscoped) and AssetSection
              (inside FilesPanel scoped) both carry their own `mt-8`, which
              is the canonical workspace section gap. Adding wrapper spacing
              on top of that would compound to ~56px (unwanted). */}
          <div className={`min-w-0 ${scopedReleaseId ? 'block' : 'hidden lg:block'}`}>
            {scopedRelease ? (
              <div className="mb-4 flex items-center gap-3 lg:hidden">
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
                    {scopedRelease.artistName || 'Unassigned artist'}
                  </p>
                  <h2 className="truncate font-display text-lg font-semibold leading-tight text-content-primary">
                    {scopedRelease.title}
                  </h2>
                </div>
              </div>
            ) : null}

            <TasksPanel
              id={TASKS_PANEL_ID}
              tasks={scopedTasks}
              scopedRelease={scopedRelease}
              onClearScope={() => setScope(null)}
            />
            {/* Key on the scope id so FilesPanel remounts when the user picks
                a different release. Cheap, idiomatic React way to reset its
                toast state (and AssetSection's internal asset list) without an
                effect — see React docs "Resetting state with a key". */}
            <FilesPanel
              key={scopedRelease?.id ?? 'unscoped'}
              scopedRelease={scopedRelease}
            />
          </div>
        </div>
      </div>

      <CreateReleaseModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(releaseId) => {
          setIsCreateModalOpen(false);
          void loadCommandCenter();
          router.push(`/dashboard/releases/${releaseId}`);
        }}
      />
    </main>
  );
}
