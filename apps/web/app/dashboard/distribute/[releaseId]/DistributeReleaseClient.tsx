'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from '@/components/icons';
import { DistributionSection } from '@/components/releases/DistributionSection';
import { useAuthStore } from '@/lib/auth-store';
import { useReleaseStore } from '@/stores/useReleaseStore';

/**
 * A rollout's Distribute step, opened from the Distribute tab (2026-10-14), so
 * the tab row keeps Distribute lit instead of jumping to Rollouts. Same section
 * the rollout's own menu opens; only the frame differs.
 *
 * The check's Fix buttons open a rollout scene (Metadata, Cover art...) through
 * useSceneOverlay, which keeps the current path. Those scenes live on the
 * rollout, so when one lands here as `?scene=` it is handed straight across to
 * the rollout with the same params.
 */
export default function DistributeReleaseClient({ releaseId }: { releaseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authLoading = useAuthStore((state) => state.isLoading);
  const releases = useReleaseStore((state) => state.releases);
  const initialLoading = useReleaseStore((state) => state.isInitialLoading);
  const loadCommandCenter = useReleaseStore((state) => state.loadCommandCenter);

  const scene = searchParams.get('scene');
  useEffect(() => {
    if (!scene || scene === 'distribute') return;
    const next = new URLSearchParams(searchParams.toString());
    next.set('release', releaseId);
    router.replace(`/dashboard?${next.toString()}`);
  }, [scene, searchParams, releaseId, router]);

  useEffect(() => {
    void loadCommandCenter();
  }, [loadCommandCenter]);

  const release = releases.find((entry) => entry.id === releaseId) ?? null;
  const loading = (authLoading || initialLoading) && !release;

  return (
    <div className="pt-5 sm:pt-6">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/distribute"
          aria-label="Back to Distribute"
          className="motion-focus motion-press grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        {release ? (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
              {release.artistName || 'Unassigned artist'}
            </p>
            <h2 className="truncate font-display text-lg font-semibold leading-tight text-content-primary">
              {release.title}
            </h2>
          </div>
        ) : null}
      </div>

      {release ? (
        <DistributionSection release={release} />
      ) : loading ? (
        <div className="mt-8 h-64 animate-pulse border border-stroke-default bg-bg-surface" aria-busy="true" />
      ) : (
        <p className="mt-8 text-sm text-content-secondary">We could not find this rollout.</p>
      )}
    </div>
  );
}
