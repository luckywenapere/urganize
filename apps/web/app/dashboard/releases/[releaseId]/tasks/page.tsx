'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@urganize/ui';
import { ReleaseOperationsBoard } from '@/components/releases/ReleaseOperationsBoard';
import { ReleaseWorkspaceTabs } from '@/components/releases/ReleaseWorkspaceTabs';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionCard } from '@/components/shared/SectionCard';
import { Toast } from '@/components/shared/Toast';
import { TASKS_CHANGED_EVENT } from '@/components/tasks/TaskUIProvider';
import type { ReleaseTasksResponse } from '@/lib/tasks';
import { supabase } from '@/lib/supabase/client';

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

function ReleaseBoardSkeleton() {
  return (
    <div className="space-y-4">
      <SectionCard className="space-y-4 sm:p-6">
        <div className="h-4 w-36 skeleton-shimmer" />
        <div className="h-10 w-72 max-w-full skeleton-shimmer" />
        <div className="h-4 w-full max-w-xl skeleton-shimmer" />
      </SectionCard>
      <div className="grid gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="min-h-80 border border-stroke-default bg-bg-surface p-3">
            <div className="h-4 w-20 skeleton-shimmer" />
            <div className="mt-5 space-y-3">
              <div className="h-32 skeleton-shimmer" />
              <div className="h-32 skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReleaseTasksPage() {
  const params = useParams<{ releaseId: string }>();
  const releaseId = Array.isArray(params?.releaseId) ? params.releaseId[0] : params?.releaseId || '';
  const [board, setBoard] = useState<ReleaseTasksResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  const loadBoard = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!releaseId) {
        return;
      }

      if (mode === 'initial') {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setError('');

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error('Session expired. Please sign in again.');
        }

        const response = await fetch(`/api/releases/${releaseId}/tasks`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: 'no-store',
        });

        const payload = (await response.json().catch(() => ({}))) as ReleaseTasksResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error || 'Could not load release board.');
        }

        setBoard(payload);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load release board.');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [releaseId]
  );

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    const handleTasksChanged = () => {
      void loadBoard('refresh');
    };

    window.addEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
  }, [loadBoard]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const stats = useMemo(() => {
    const tasks = board?.tasks || [];
    const complete = tasks.filter((task) => task.status === 'done').length;
    const active = tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length;
    const assigned = tasks.filter((task) => Boolean(task.assignedToUserId)).length;
    const completion = tasks.length ? Math.round((complete / tasks.length) * 100) : 0;
    return { active, assigned, complete, completion, total: tasks.length };
  }, [board?.tasks]);

  return (
    <main className="min-h-screen bg-bg-base text-content-primary" data-ph-capture-attribute-section="release-operations-board">
      <div className="mx-auto max-w-[1680px] px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <Link
            href={`/dashboard/releases/${releaseId}`}
            className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-content-secondary hover:text-content-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to release
          </Link>
        </div>

        {toast ? (
          <div className="mb-4">
            <Toast message={toast.message} tone={toast.tone} />
          </div>
        ) : null}

        {isLoading ? <ReleaseBoardSkeleton /> : null}

        {!isLoading && error ? (
          <SectionCard>
            <EmptyState title="Could not load the operations board" description={error} />
          </SectionCard>
        ) : null}

        {!isLoading && !error && board ? (
          <div className="space-y-5">
            <SectionCard className="p-4 sm:p-5">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
                    Release operations board
                  </p>
                  <h1 className="mt-2 font-display text-3xl font-semibold tracking-normal text-content-primary sm:text-4xl">
                    {board.release.title}
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-content-secondary">
                    Move work through prep, distribution, content, marketing, release day, and post-release follow-up.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void loadBoard('refresh')}
                    isLoading={isRefreshing}
                    leftIcon={<RefreshCw className="h-4 w-4" />}
                  >
                    Refresh
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ['Total', stats.total],
                  ['Active', stats.active],
                  ['Assigned', stats.assigned],
                  ['Done', stats.complete],
                  ['Progress', `${stats.completion}%`],
                ].map(([label, value]) => (
                  <div key={label} className="border border-stroke-subtle bg-bg-elevated/65 p-3">
                    <p className="text-xs text-content-tertiary">{label}</p>
                    <p className="mt-2 text-xl font-semibold text-content-primary">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <ReleaseWorkspaceTabs releaseId={releaseId} />
              </div>
            </SectionCard>

            <ReleaseOperationsBoard
              board={board}
              onBoardChange={setBoard}
              onError={(message) => setToast({ tone: 'error', message })}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}
