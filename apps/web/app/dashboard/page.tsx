'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CalendarDays } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { TASK_DONE_STATUS } from '@/lib/execution-types';
import { formatArtistName } from '@/lib/release-execution';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { WorkspaceView } from '@/components/workspace/WorkspaceView';

// Feature flag — when 'true', /dashboard renders the consolidated workspace
// (releases + tasks side by side) in place of the legacy greeting/cards layout.
// NEXT_PUBLIC_ prefix so the value is inlined at build time. No route is moved;
// the swap is component-level. Flag stays off in prod until the workspace is
// validated; flip via .env.local for dev preview.
const WORKSPACE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

function formatDate(value: string | null): string {
  if (!value) return 'No date set';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 'No date set';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-56 rounded-none" />
        <SkeletonBlock className="h-4 w-80 rounded-none" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-stroke-default bg-bg-surface p-5">
            <SkeletonBlock className="h-4 w-24 rounded-none" />
            <SkeletonBlock className="mt-3 h-6 w-48 rounded-none" />
            <SkeletonBlock className="mt-4 h-3 w-32 rounded-none" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  if (WORKSPACE_ENABLED) {
    return <WorkspaceView />;
  }
  return <LegacyDashboard />;
}

function LegacyDashboard() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, error, loadCommandCenter } = useReleaseStore();
  const tasks = useTaskStore((s) => s.tasks);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, router, user]);

  if (authLoading || isInitialLoading) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 sm:px-6">
          <DashboardSkeleton />
        </div>
      </main>
    );
  }

  const greeting = user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Welcome back';

  const dueSoonTasks = tasks
    .filter((t) => t.status !== TASK_DONE_STATUS && t.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5);

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-content-primary sm:text-3xl">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            {releases.length === 0
              ? 'Create your first release to get started.'
              : `${releases.length} active release${releases.length === 1 ? '' : 's'}`}
          </p>
        </div>

        {error ? (
          <div className="mt-6 flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        {releases.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Releases</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {releases.map((release) => {
                const releaseTasks = tasks.filter((t) => t.releaseId === release.id);
                const doneTasks = releaseTasks.filter((t) => t.status === TASK_DONE_STATUS);

                return (
                  <Link
                    key={release.id}
                    href={`/dashboard/releases/${release.id}`}
                    className="group border border-stroke-default bg-bg-surface p-5 transition-colors hover:border-stroke-strong hover:bg-bg-hover"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
                      {formatArtistName(release.artistName)}
                    </p>
                    <h3 className="mt-1 font-display text-lg font-semibold text-content-primary group-hover:text-brand">
                      {release.title}
                    </h3>
                    <div className="mt-3 flex items-center gap-4 text-xs text-content-secondary">
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-content-tertiary" />
                        {formatDate(release.releaseDate)}
                      </span>
                      <span>
                        {doneTasks.length} of {releaseTasks.length} tasks done
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {dueSoonTasks.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">Due soon</h2>
            <div className="mt-3 space-y-1">
              {dueSoonTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between border border-stroke-default bg-bg-surface px-4 py-3 text-sm"
                >
                  <span className="truncate text-content-primary">{task.title}</span>
                  <span className="shrink-0 pl-4 text-xs text-content-tertiary">
                    {formatDate(task.dueDate ?? null)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
