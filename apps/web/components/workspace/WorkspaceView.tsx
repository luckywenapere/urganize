'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { type Task } from '@/lib/tasks';
import type { Release } from '@/types/releases';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
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

function WorkspaceSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-[170px] w-full rounded-none" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-[110px] w-full rounded-none" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
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
    setScope(nextScope);

    // When the layout is stacked (below lg), the tasks panel sits below the
    // releases column and the newly scoped tasks would otherwise be off-screen.
    // Smooth-scroll the panel into view. Defer to next frame so the scope
    // write + bucket re-render has applied before we measure.
    if (nextScope && typeof window !== 'undefined') {
      const stacked = window.matchMedia('(max-width: 1023px)').matches;
      if (stacked) {
        requestAnimationFrame(() => {
          document
            .getElementById(TASKS_PANEL_ID)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
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
      <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-6 sm:px-6">
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

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <ReleasesColumn
            releases={releaseCards}
            scopedReleaseId={scopedReleaseId}
            onSelect={handleSelect}
            onCreateRelease={() => setIsCreateModalOpen(true)}
          />
          {/* Right column stacks: tasks panel, then per-release files panel.
              No `space-y-*` here — FilesPanel (unscoped) and AssetSection
              (inside FilesPanel scoped) both carry their own `mt-8`, which is
              the canonical workspace section gap. Adding wrapper spacing on
              top of that would compound to ~56px (unwanted). */}
          <div>
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
