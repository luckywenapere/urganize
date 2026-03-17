'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from '@/lib/auth-store';
import { SectionCard } from '@/components/shared/SectionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ReleasePlaybookProgressCard } from '@/components/releases/ReleasePlaybookProgressCard';
import { ReleasePlaybookPhaseCard } from '@/components/releases/ReleasePlaybookPhaseCard';
import { ReleasePlaybookSkeleton } from '@/components/loading/ReleasePlaybookSkeleton';
import type { ReleasePlaybookPhase } from '@/lib/release-playbook';

type PlaybookPayload = {
  release: {
    id: string;
    title: string;
    artistName: string;
    releaseDate: string;
    status: 'draft' | 'in_progress' | 'ready';
  };
  playbook: {
    phases: ReleasePlaybookPhase[];
    completedCount: number;
    totalCount: number;
    remainingCount: number;
    completionPercent: number;
  };
  error?: string;
};

const formatReleaseDate = (value: string) => {
  if (!value) return 'Not scheduled yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not scheduled yet' : date.toLocaleDateString();
};

const statusToneByReleaseStatus: Record<PlaybookPayload['release']['status'], 'neutral' | 'warning' | 'success'> = {
  draft: 'neutral',
  in_progress: 'warning',
  ready: 'success',
};

export default function ReleasePlaybookPage() {
  const params = useParams<{ releaseId: string }>();
  const releaseId = Array.isArray(params?.releaseId) ? params.releaseId[0] : params?.releaseId || '';
  const { user, isLoading: authLoading } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [data, setData] = useState<PlaybookPayload | null>(null);
  const [error, setError] = useState('');
  const [pendingItemKey, setPendingItemKey] = useState('');

  const loadData = useCallback(async () => {
    if (!releaseId) return;
    setIsLoading(true);
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/releases/${releaseId}/playbook`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as PlaybookPayload;
      if (!response.ok || !payload.release || !payload.playbook) {
        throw new Error(payload.error || 'Could not load release playbook.');
      }

      setData(payload);
    } catch (loadError: any) {
      setError(loadError?.message || 'Could not load release playbook.');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, [releaseId]);

  useEffect(() => {
    if (!authLoading && user && releaseId) {
      void loadData();
    }
  }, [authLoading, loadData, releaseId, user]);

  const handleToggle = async (itemKey: string, isCompleted: boolean) => {
    if (!releaseId) return;

    setPendingItemKey(itemKey);
    setError('');

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      if (!accessToken) throw new Error('Session expired. Please sign in again.');

      const response = await fetch(`/api/releases/${releaseId}/playbook`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ itemKey, isCompleted }),
      });

      const payload = (await response.json().catch(() => ({}))) as { playbook?: PlaybookPayload['playbook']; error?: string };
      if (!response.ok || !payload.playbook) {
        throw new Error(payload.error || 'Could not update release playbook.');
      }

      setData((current) => (current ? { ...current, playbook: payload.playbook! } : current));
    } catch (updateError: any) {
      setError(updateError?.message || 'Could not update release playbook.');
    } finally {
      setPendingItemKey('');
    }
  };

  if ((!hasLoadedOnce && isLoading) || (!user && authLoading)) {
    return <ReleasePlaybookSkeleton />;
  }

  if (!user) return <ReleasePlaybookSkeleton />;

  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-16 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link
            href={`/dashboard/releases/${releaseId}`}
            className="inline-flex min-h-10 items-center text-sm text-content-secondary hover:text-content-primary"
          >
            Back to release
          </Link>
        </div>

        {error ? (
          <div className="mb-4 rounded-2xl border border-status-error/35 bg-status-error/10 px-4 py-3 text-sm text-status-error">
            {error}
          </div>
        ) : null}

        {data?.release ? (
          <div className="space-y-6">
            <SectionCard className="sm:p-7">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Release Playbook</p>
                    <StatusBadge
                      label={data.release.status.replace('_', ' ')}
                      tone={statusToneByReleaseStatus[data.release.status]}
                    />
                  </div>
                  <h1 className="mt-2 text-[clamp(2.2rem,5vw,3.5rem)] tracking-tight text-content-primary">
                    {data.release.title}
                  </h1>
                  <p className="mt-4 max-w-3xl text-sm text-content-secondary">
                    A structured checklist of the key steps strong music teams typically take when preparing and
                    releasing a song.
                  </p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Artist</p>
                      <p className="mt-2 text-base font-semibold text-content-primary">
                        {data.release.artistName || 'Not set'}
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Release date</p>
                      <p className="mt-2 text-base font-semibold text-content-primary">
                        {formatReleaseDate(data.release.releaseDate)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="w-full shrink-0 rounded-[24px] border border-stroke-subtle bg-bg-elevated/65 p-4 lg:w-[260px]">
                  <p className="text-xs uppercase tracking-[0.12em] text-content-tertiary">Workspace</p>
                  <div className="mt-3 flex flex-col gap-3">
                    <Link
                      href={`/dashboard/releases/${releaseId}`}
                      className="min-h-11 w-full rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    >
                      Overview
                    </Link>
                    <Link
                      href={`/dashboard/releases/${releaseId}/metadata`}
                      className="min-h-11 w-full rounded-2xl border border-stroke-default bg-bg-surface px-5 py-3 text-center text-sm text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    >
                      View Metadata
                    </Link>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard className="sm:p-7">
              <ReleasePlaybookProgressCard
                completionPercent={data.playbook.completionPercent}
                completedCount={data.playbook.completedCount}
                totalCount={data.playbook.totalCount}
                remainingCount={data.playbook.remainingCount}
              />
            </SectionCard>

            {data.playbook.phases.length === 0 ? (
              <SectionCard>
                <EmptyState
                  title="No playbook items yet"
                  description="This release playbook will populate with the default phased checklist."
                />
              </SectionCard>
            ) : (
              <div className="grid gap-5 xl:grid-cols-2">
                {data.playbook.phases.map((phase) => (
                  <ReleasePlaybookPhaseCard
                    key={phase.key}
                    phase={phase}
                    pendingItemKey={pendingItemKey}
                    onToggle={handleToggle}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <SectionCard>
            <EmptyState
              title="Something went wrong. Try again."
              description="We could not load this release playbook."
            />
          </SectionCard>
        )}
      </div>
    </main>
  );
}
