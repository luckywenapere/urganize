'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CalendarDays } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { TASK_DONE_STATUS } from '@/lib/execution-types';
import { formatArtistName } from '@/lib/release-execution';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { useKnownReleaseCount } from '@/components/loading/known-counts';
import { WorkspaceView } from '@/components/workspace/WorkspaceView';

// Feature flag — when 'true', /dashboard renders the consolidated workspace
// (releases + tasks side by side) in place of the legacy greeting/cards layout.
// NEXT_PUBLIC_ prefix so the value is inlined at build time. No route is moved;
// the swap is component-level. Flag stays off in prod until the workspace is
// validated; flip via .env.local for dev preview.
const WORKSPACE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// Null for a dateless release so the caller omits the line — matching
// WorkspaceReleaseCard (2026-08-09). Kept in sync even though this legacy
// layout is dark in production, so the documented revert path doesn't
// resurrect the old placeholder.
function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

export default function DashboardPage() {
  if (WORKSPACE_ENABLED) {
    return <WorkspaceView />;
  }
  return <LegacyDashboard />;
}

// LegacyDashboard's own loading shape (2026-08-04) — it used to reuse
// `WorkspaceSkeleton` (built for the two-pane workspace's very different
// layout: release grid + a scoped tasks panel with its own pill row), which
// never matched this page's actual shape (greeting → release-card grid →
// due-soon list). Effectively dead in production today (`WORKSPACE_ENABLED`
// is a build-time constant, and the flag has been on since the 2026-06-01
// deploy — see CLAUDE.md), but it's kept as the documented one-line revert
// path, so its skeleton should still be accurate if that revert is ever used.
function LegacyDashboardSkeleton() {
  const knownCount = useKnownReleaseCount();
  return (
    <main className="text-content-primary" aria-hidden="true">
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 sm:px-6">
        <div className="space-y-2">
          <SkeletonBlock className="h-7 w-56" />
          <SkeletonBlock className="h-3.5 w-40" />
        </div>

        <div className="mt-8">
          <SkeletonBlock className="h-2.5 w-16" />
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: knownCount }).map((_, index) => (
              <div key={`legacy-card-${index}`} className="border border-stroke-default bg-bg-surface p-5">
                <SkeletonBlock className="h-2.5 w-20" />
                <SkeletonBlock className="mt-2 h-5 w-3/4" />
                <SkeletonBlock className="mt-3 h-3 w-40" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8">
          <SkeletonBlock className="h-2.5 w-16" />
          <div className="mt-3 space-y-1">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`legacy-task-${index}`}
                className="flex items-center justify-between border border-stroke-default bg-bg-surface px-4 py-3"
              >
                <SkeletonBlock className="h-3 w-48" />
                <SkeletonBlock className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
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

  // ONE skeleton, rendered here (no route-segment Suspense fallback). SSR
  // serializes this into HTML; hydration is a no-op reconciliation — no
  // shimmer restart, no blank gap.
  if (authLoading || isInitialLoading) {
    return <LegacyDashboardSkeleton />;
  }

  const greeting = user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Welcome back';

  const dueSoonTasks = tasks
    .filter((t) => t.status !== TASK_DONE_STATUS && t.dueDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5);

  return (
    <main className="text-content-primary">
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 sm:px-6">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-content-primary sm:text-3xl">
            {greeting}
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            {releases.length === 0
              ? 'Create your first rollout to get started.'
              : `${releases.length} active rollout${releases.length === 1 ? '' : 's'}`}
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
                      {/* Icon and date drop together for a dateless release —
                          a lone calendar glyph would read as a broken value. */}
                      {formatDate(release.releaseDate) ? (
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-content-tertiary" />
                          {formatDate(release.releaseDate)}
                        </span>
                      ) : null}
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
