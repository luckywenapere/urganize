'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@urganize/ui';
import { EmptyState } from '@/components/shared/EmptyState';
import { CreateReleaseModal } from '@/components/releases/CreateReleaseModal';
import { ReleaseCard, type ReleaseDashboardItem } from '@/components/releases/ReleaseCard';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import { supabase } from '@/lib/supabase/client';

type ReleasesPayload = {
  releases?: ReleaseDashboardItem[];
  error?: string;
};

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

function ReleaseCardSkeleton() {
  return (
    <div className="overflow-hidden border border-stroke-default bg-bg-surface">
      <SkeletonBlock className="aspect-square w-full rounded-none" />
      <div className="space-y-5 p-4 sm:p-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <SkeletonBlock className="h-3 w-24 rounded-none" />
            <SkeletonBlock className="h-6 w-20 rounded-none" />
          </div>
          <SkeletonBlock className="mt-3 h-6 w-4/5 rounded-none" />
          <SkeletonBlock className="mt-2 h-6 w-2/3 rounded-none" />
        </div>
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-36 rounded-none" />
          <SkeletonBlock className="h-4 w-32 rounded-none" />
        </div>
        <div>
          <div className="mb-2 flex justify-between">
            <SkeletonBlock className="h-3 w-24 rounded-none" />
            <SkeletonBlock className="h-3 w-10 rounded-none" />
          </div>
          <SkeletonBlock className="h-2 w-full rounded-none" />
        </div>
      </div>
    </div>
  );
}

function ReleasesLoadingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: 6 }).map((_, index) => (
        <ReleaseCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function ReleasesDashboardPage() {
  const router = useRouter();
  const [releases, setReleases] = useState<ReleaseDashboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const loadReleases = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
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

      const response = await fetch('/api/releases', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as ReleasesPayload;
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load releases.');
      }

      setReleases(Array.isArray(payload.releases) ? payload.releases : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load releases.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReleases();
  }, [loadReleases]);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <section className="flex flex-col gap-4 border border-stroke-default bg-bg-surface p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-content-tertiary">
            Release operations
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-normal text-content-primary sm:text-3xl">
            Releases
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-content-secondary">
            Track active rollouts, assets, and collaborators across every artist release.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => void loadReleases('refresh')}
            isLoading={isRefreshing}
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>
      </section>

      {error ? (
        <div className="flex items-start gap-3 border border-status-error/30 bg-status-error/10 p-4 text-sm text-status-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Releases could not be loaded.</p>
            <p className="mt-1 text-status-error/80">{error}</p>
          </div>
        </div>
      ) : null}

      {isLoading ? <ReleasesLoadingGrid /> : null}

      {!isLoading && !error && releases.length === 0 ? (
        <EmptyState
          title="No releases yet"
          description="Create your first release to start collecting assets, assigning tasks, and tracking progress."
          action={
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Create release
            </button>
          }
        />
      ) : null}

      {!isLoading && !error && releases.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {releases.map((release) => (
            <ReleaseCard key={release.id} release={release} />
          ))}
        </section>
      ) : null}

      <CreateReleaseModal
        open={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={(releaseId) => {
          setIsCreateModalOpen(false);
          void loadReleases('refresh');
          router.push(`/dashboard/releases/${releaseId}`);
        }}
      />
    </div>
  );
}
