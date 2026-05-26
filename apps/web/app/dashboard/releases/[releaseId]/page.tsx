'use client';

import { useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CalendarDays, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { TASK_DONE_STATUS } from '@/lib/execution-types';
import { formatArtistName } from '@/lib/release-execution';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { ReleaseInfoSection } from '@/components/releases/ReleaseInfoSection';

function formatDate(value: string | null): string {
  if (!value) return 'No date set';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'No date set';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  planning: 'Planning',
  in_progress: 'In progress',
  ready: 'Ready',
  released: 'Released',
  archived: 'Archived',
};

function ReleaseDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
      <SkeletonBlock className="h-3 w-20 rounded-none" />
      <SkeletonBlock className="mt-3 h-8 w-64 rounded-none" />
      <SkeletonBlock className="mt-2 h-4 w-48 rounded-none" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-12 w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}

export default function ReleaseDetailPage() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, error, loadCommandCenter } = useReleaseStore();
  const tasks = useTaskStore((s) => s.tasks);
  const { openTask, openQuickCreate } = useTaskUI();

  useEffect(() => {
    if (authLoading || !releaseId) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, releaseId, router, user]);

  const release = releases.find((r) => r.id === releaseId);
  const releaseTasks = useMemo(
    () => tasks.filter((t) => t.releaseId === releaseId),
    [tasks, releaseId]
  );
  const doneTasks = releaseTasks.filter((t) => t.status === TASK_DONE_STATUS);
  const progress = releaseTasks.length > 0 ? Math.round((doneTasks.length / releaseTasks.length) * 100) : 0;

  if (authLoading || isInitialLoading) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <ReleaseDetailSkeleton />
      </main>
    );
  }

  if (!release) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
          <div className="flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Release not found.</p>
              <p className="mt-1 text-status-error/80">{error || 'This release may have been deleted.'}</p>
            </div>
          </div>
          <Link href="/dashboard" className="mt-4 inline-flex border border-stroke-default bg-bg-surface px-4 py-2 text-sm font-semibold text-content-primary hover:bg-bg-hover">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const normalizedStatus = statusLabel[release.status] || release.status.replace(/_/g, ' ');

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
              {formatArtistName(release.artistName)}
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-content-primary sm:text-3xl">
              {release.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-content-secondary">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-content-tertiary" />
                {formatDate(release.releaseDate)}
              </span>
              <span className="border border-stroke-default bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium capitalize text-content-secondary">
                {normalizedStatus}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled
              title="Coming soon"
              className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-surface px-3 text-sm font-medium text-content-tertiary opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate status update
            </button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-6 border border-stroke-default bg-bg-surface p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-content-secondary">Task progress</span>
            <span className="text-content-primary">
              {doneTasks.length} of {releaseTasks.length} done
            </span>
          </div>
          <ProgressBar value={progress} className="mt-2 h-2 rounded-none" fillClassName="rounded-none" />
        </div>

        {/* Task list */}
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Tasks</h2>
          {releaseTasks.length === 0 ? (
            <div className="mt-3 border border-stroke-default bg-bg-surface p-6 text-center">
              <p className="text-sm text-content-secondary">No tasks yet for this release.</p>
              <button
                type="button"
                onClick={() => openQuickCreate({ releaseId, source: 'inline' })}
                className="mt-3 inline-flex border border-brand/25 bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
              >
                Add tasks
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-1">
              {releaseTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => openTask(task.id)}
                  className="flex w-full items-center gap-3 border border-stroke-default bg-bg-surface px-4 py-3 text-left text-sm transition-colors hover:bg-bg-hover"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      task.status === TASK_DONE_STATUS
                        ? 'bg-brand'
                        : task.status === 'in_progress'
                          ? 'bg-status-warning'
                          : 'bg-content-tertiary'
                    }`}
                  />
                  <span className={`min-w-0 flex-1 truncate ${task.status === TASK_DONE_STATUS ? 'text-content-tertiary line-through' : 'text-content-primary'}`}>
                    {task.title}
                  </span>
                  {task.dueDate ? (
                    <span className="shrink-0 text-xs text-content-tertiary">{formatDate(task.dueDate)}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>

        <ReleaseInfoSection releaseId={releaseId} />
      </div>
    </main>
  );
}
