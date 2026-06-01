'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { computeWorkspaceStats, type Task } from '@/lib/tasks';
import type { Release } from '@/types/releases';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { GreetingHeader } from './GreetingHeader';
import { StatChips } from './StatChips';
import { ReleasesColumn, type ReleaseCardData } from './ReleasesColumn';
import { TasksPanel } from './TasksPanel';
import { useReleaseScope } from './useReleaseScope';

const TASKS_PANEL_ID = 'workspace-tasks';

function WorkspaceSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-10 sm:px-6">
        <div className="space-y-3">
          <SkeletonBlock className="h-3 w-24 rounded-none" />
          <SkeletonBlock className="h-8 w-64 rounded-none" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-[68px] w-[128px] rounded-none" />
          ))}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[3fr_2fr]">
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
  const { releases, isInitialLoading, isRefreshing, error, loadCommandCenter } = useReleaseStore();
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
    return releases.map((release) => {
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

  const stats = useMemo(
    () => computeWorkspaceStats(releases.length, taskList),
    [releases.length, taskList]
  );

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

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-10 sm:px-6">
        <header className="space-y-4">
          <GreetingHeader userName={user?.name} />
          <StatChips
            activeReleases={stats.activeReleases}
            tasksDone={stats.tasksDone}
            tasksTotal={stats.tasksTotal}
            overdue={stats.overdueCount}
            dueToday={stats.dueTodayCount}
          />
        </header>

        {error ? (
          <div className="mt-6 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-[3fr_2fr]">
          <ReleasesColumn
            releases={releaseCards}
            scopedReleaseId={scopedReleaseId}
            onSelect={handleSelect}
            onRefresh={() => {
              void loadCommandCenter();
            }}
            isRefreshing={isRefreshing}
            onCreateRelease={() => setIsCreateModalOpen(true)}
          />
          <TasksPanel
            id={TASKS_PANEL_ID}
            tasks={scopedTasks}
            scopedRelease={scopedRelease}
            onClearScope={() => setScope(null)}
          />
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
