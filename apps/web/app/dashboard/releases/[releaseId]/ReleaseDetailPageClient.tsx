'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CalendarDays, ChevronDown, Lock, Sparkles } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { TASK_DONE_STATUS, TASK_LOCKED_STATUS } from '@/lib/execution-types';
import { formatMilestoneDate, isEventMilestone } from '@/lib/tasks';
import { formatArtistName } from '@/lib/release-execution';
import { TaskDetailInline, useTaskUI } from '@/components/tasks/TaskUIProvider';
import { ReleaseDetailSkeleton } from '@/components/loading/ReleaseDetailSkeleton';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { Toast } from '@/components/shared/Toast';
import { ReleaseInfoSection } from '@/components/releases/ReleaseInfoSection';
import { AssetSection } from '@/components/releases/AssetSection';
import { ContentCalendarSection } from '@/components/releases/ContentCalendarSection';
import dynamic from 'next/dynamic';
import { TaskCompletionCheckbox } from '@/components/tasks/TaskCompletionCheckbox';
import { supabase } from '@/lib/supabase/client';
import { type ReleaseContext } from '@/lib/release-tailoring';

// Feature flags — both AI features stay hidden until the gateway is wired to a
// capable model. NEXT_PUBLIC_ prefix so the value is inlined at build time for
// this client component. The API routes guard the same flags server-side.
const TAILOR_PLAN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TAILOR_PLAN === 'true';
const STATUS_UPDATE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_STATUS_UPDATE === 'true';
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
// Files (URG-182): the assets API routes 404 on the same flag server-side.
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';

// The AI modals are dynamic AND only rendered behind their flag (bottom of
// the JSX): while a flag is off — as both are in production today — the
// modal's chunk is never requested at all; once on, it loads as an async
// chunk instead of riding this page's bundle.
const TailorPlanModal = dynamic(
  () => import('@/components/releases/TailorPlanModal').then((m) => m.TailorPlanModal),
  { ssr: false }
);
const StatusUpdateModal = dynamic(
  () => import('@/components/releases/StatusUpdateModal').then((m) => m.StatusUpdateModal),
  { ssr: false }
);

type ToastState = {
  message: string;
  tone: 'success' | 'error' | 'warning';
};

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

export default function ReleaseDetailPage() {
  const { releaseId } = useParams<{ releaseId: string }>();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuthStore();
  const { releases, isInitialLoading, error, loadCommandCenter } = useReleaseStore();
  const tasks = useTaskStore((s) => s.tasks);
  const { openTask, openQuickCreate, isTaskOpen } = useTaskUI();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isTailorOpen, setIsTailorOpen] = useState(false);
  const [savedContext, setSavedContext] = useState<ReleaseContext | null>(null);
  const [hasTailoring, setHasTailoring] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isGeneratingStatus, setIsGeneratingStatus] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState('');

  const generateStatus = async () => {
    setIsStatusOpen(true);
    setIsGeneratingStatus(true);
    setStatusUpdate('');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session expired. Please sign in again.');
      const res = await fetch(`/api/releases/${releaseId}/generate-status`, {
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

  // Load any prior tailoring so the button label and modal pre-fill reflect it.
  useEffect(() => {
    if (authLoading || !user || !releaseId) return;
    let cancelled = false;
    const loadTailoring = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/releases/${releaseId}/tailor-plan`, {
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
  }, [authLoading, releaseId, user]);

  useEffect(() => {
    if (!toast) return;
    const dismissAfterMs = toast.tone === 'warning' ? 6000 : 2600;
    const timeout = window.setTimeout(() => setToast(null), dismissAfterMs);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (authLoading || !releaseId) return;
    if (!user) {
      router.replace('/auth');
      return;
    }
    void loadCommandCenter();
  }, [authLoading, loadCommandCenter, releaseId, router, user]);

  const release = releases.find((r) => r.id === releaseId);

  // Differentiate browser tabs per release once data loads. The server
  // wrapper's static 'Release | Urganize' stays as the SSR/loading fallback —
  // generateMetadata can't resolve the title server-side because auth is a
  // Bearer token in localStorage, not a cookie the server can read.
  useEffect(() => {
    if (release?.title) {
      document.title = `${release.title} | Urganize`;
      return;
    }
    // Release gone from the store (deleted elsewhere, store eviction) — fall
    // back to the wrapper's static title rather than a dead release's name.
    document.title = 'Release | Urganize';
  }, [release?.title]);

  const releaseTasks = useMemo(
    () => tasks.filter((t) => t.releaseId === releaseId),
    [tasks, releaseId]
  );
  // Pending-completion override: just-ticked tasks stay in the open list for
  // ~1.5s before sliding into Done. Mirrors the workspace TasksPanel rule so
  // the in-place beat reads the same on both surfaces.
  const pendingCompletionIds = useTaskStore((s) => s.pendingCompletionIds);
  const doneTasks = releaseTasks.filter((t) => t.status === TASK_DONE_STATUS);
  const progress = releaseTasks.length > 0 ? Math.round((doneTasks.length / releaseTasks.length) * 100) : 0;
  const openTasks = useMemo(
    () =>
      releaseTasks.filter(
        (t) => t.status !== TASK_DONE_STATUS || pendingCompletionIds[t.id]
      ),
    [releaseTasks, pendingCompletionIds]
  );
  const doneBucketTasks = useMemo(
    () =>
      releaseTasks.filter(
        (t) => t.status === TASK_DONE_STATUS && !pendingCompletionIds[t.id]
      ),
    [releaseTasks, pendingCompletionIds]
  );
  const [isDoneBucketOpen, setIsDoneBucketOpen] = useState(false);

  // ONE skeleton, rendered here (no route-segment Suspense fallback). SSR
  // serializes this into HTML; hydration is a no-op reconciliation — no
  // shimmer restart, no blank gap.
  if (authLoading || isInitialLoading) {
    return <ReleaseDetailSkeleton />;
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

  // In-place task detail. When a task is opened from this page's task list
  // (or from any other surface while this page is mounted — notification
  // click is the cross-route case), the entire release content (header,
  // progress, task list, assets, info) is replaced with TaskDetailInline.
  // The drawer/overlay model is gone — see TaskUIProvider.tsx. Back inside
  // the detail closes the task and the release content remounts in place.
  if (isTaskOpen) {
    return (
      <main className="min-h-screen bg-bg-base text-content-primary">
        <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
          <TaskDetailInline />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
        {toast ? (
          <div className="mb-4">
            <Toast message={toast.message} tone={toast.tone} />
          </div>
        ) : null}

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
              <span className="border border-stroke-default bg-bg-elevated px-2 py-0.5 text-[11px] font-medium capitalize text-content-secondary">
                {normalizedStatus}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Top-of-page calendar entry (URG-157): the section further down
                lists/manages calendars, but navigation belongs up here in the
                header where the other release actions live. */}
            {CONTENT_CALENDAR_ENABLED ? (
              <Link
                href={`/dashboard/releases/${releaseId}/calendar`}
                className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-surface px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Content calendar
                {/* Beta stamp (2026-07-23) — matches the workspace Calendar
                    link and the calendar page header. */}
                <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                  Beta
                </span>
              </Link>
            ) : null}
            {TAILOR_PLAN_ENABLED ? (
              <button
                type="button"
                onClick={() => setIsTailorOpen(true)}
                className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-surface px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {hasTailoring ? 'Re-tailor plan' : 'Tailor plan'}
              </button>
            ) : null}
            {STATUS_UPDATE_ENABLED ? (
              <button
                type="button"
                onClick={() => void generateStatus()}
                disabled={isGeneratingStatus}
                className="inline-flex h-9 items-center gap-2 border border-stroke-default bg-bg-surface px-3 text-sm font-medium text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-60"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isGeneratingStatus ? 'Generating…' : 'Generate status update'}
              </button>
            ) : null}
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

        {/* Task list. Render rule mirrors the workspace TasksPanel: completed
            tasks (with no pending in-place beat) move to a single Done group
            at the bottom, collapsed by default, with the count as the
            primary signal. */}
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
            <>
              <div className="mt-3 space-y-1">
                {openTasks.map((task) => {
                  const isLocked = task.status === TASK_LOCKED_STATUS;
                  const isDone = task.status === TASK_DONE_STATUS;
                  const isMilestone = isEventMilestone(task);
                  const isLeaving = Boolean(pendingCompletionIds[task.id]);
                  return (
                    <div
                      key={task.id}
                      className={`flex w-full items-center gap-3 border border-stroke-default px-4 py-3 text-sm ${
                        isLocked ? 'bg-bg-surface/60' : 'bg-bg-surface'
                      } ${isMilestone ? 'border-l-2 border-l-status-info' : ''} ${
                        isLeaving ? 'task-row-pending-completion' : ''
                      }`}
                    >
                      <TaskCompletionCheckbox
                        taskId={task.id}
                        status={task.status}
                        onBlocker={(message) => setToast({ tone: 'warning', message })}
                      />
                      {isLocked ? (
                        <Lock
                          className="h-3.5 w-3.5 shrink-0 text-content-tertiary"
                          aria-label="Locked — waiting on a prerequisite"
                        />
                      ) : isMilestone ? (
                        <CalendarDays
                          className="h-3.5 w-3.5 shrink-0 text-status-info"
                          aria-label="Event milestone"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openTask(task.id)}
                        className="motion-focus flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:text-content-primary"
                      >
                        <span
                          className={`min-w-0 flex-1 truncate ${
                            isDone
                              ? 'text-content-tertiary line-through'
                              : isLocked
                                ? 'text-content-secondary'
                                : 'text-content-primary'
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.dueDate ? (
                          <span
                            className={`shrink-0 text-xs ${
                              isMilestone ? 'text-status-info' : 'text-content-tertiary'
                            }`}
                          >
                            {isMilestone ? formatMilestoneDate(task.dueDate) : formatDate(task.dueDate)}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>

              {doneBucketTasks.length > 0 ? (
                <div className="mt-3 border border-stroke-default bg-bg-surface/60">
                  <button
                    type="button"
                    onClick={() => setIsDoneBucketOpen((v) => !v)}
                    aria-expanded={isDoneBucketOpen}
                    aria-controls="release-done-bucket"
                    className={`motion-focus flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-content-secondary transition-colors hover:bg-bg-hover ${
                      isDoneBucketOpen ? 'border-b border-stroke-subtle' : ''
                    }`}
                  >
                    <span>
                      Done
                      <span className="ml-2 font-normal text-content-tertiary">
                        ({doneBucketTasks.length})
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${
                        isDoneBucketOpen ? '' : '-rotate-90'
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  {isDoneBucketOpen ? (
                    <div id="release-done-bucket" className="space-y-1 px-2 py-2">
                      {doneBucketTasks.map((task) => {
                        const isMilestone = isEventMilestone(task);
                        return (
                          <div
                            key={task.id}
                            className={`flex w-full items-center gap-3 border border-stroke-default bg-bg-surface px-4 py-3 text-sm ${
                              isMilestone ? 'border-l-2 border-l-status-info' : ''
                            }`}
                          >
                            <TaskCompletionCheckbox
                              taskId={task.id}
                              status={task.status}
                              onBlocker={(message) => setToast({ tone: 'warning', message })}
                            />
                            <button
                              type="button"
                              onClick={() => openTask(task.id)}
                              className="motion-focus flex min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:text-content-primary"
                            >
                              <span className="min-w-0 flex-1 truncate text-content-tertiary line-through">
                                {task.title}
                              </span>
                              {task.dueDate ? (
                                <span
                                  className={`shrink-0 text-xs ${
                                    isMilestone ? 'text-status-info' : 'text-content-tertiary'
                                  }`}
                                >
                                  {isMilestone
                                    ? formatMilestoneDate(task.dueDate)
                                    : formatDate(task.dueDate)}
                                </span>
                              ) : null}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </section>

        <ContentCalendarSection releaseId={releaseId} />

        {FILES_ENABLED ? (
          <AssetSection
            releaseId={releaseId}
            onToast={(message, tone) => setToast({ message, tone })}
          />
        ) : null}

        <ReleaseInfoSection releaseId={releaseId} />
      </div>

      {TAILOR_PLAN_ENABLED ? (
        <TailorPlanModal
          open={isTailorOpen}
          releaseId={releaseId}
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
    </main>
  );
}
