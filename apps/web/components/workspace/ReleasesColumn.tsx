'use client';

import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@urganize/ui';
import type { Release } from '@/types/releases';
import { WorkspaceReleaseCard } from './WorkspaceReleaseCard';

export type ReleaseCardData = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'status' | 'releaseDate'>;
  tasksDone: number;
  tasksTotal: number;
};

type ReleasesColumnProps = {
  releases: ReleaseCardData[];
  scopedReleaseId: string | null;
  onSelect: (releaseId: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  /** Opens the create-release modal. Surfaces as a full-width button below
   * sm where the AppTopbar's "New release" button is hidden. */
  onCreateRelease: () => void;
};

export function ReleasesColumn({
  releases,
  scopedReleaseId,
  onSelect,
  onRefresh,
  isRefreshing,
  onCreateRelease,
}: ReleasesColumnProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Releases
        </h2>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          isLoading={isRefreshing}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Refresh
        </Button>
      </div>

      {/* Mobile-only full-width "New release". AppTopbar's New release button
          is `hidden sm:inline-flex`; this fills the gap below 640px. */}
      <button
        type="button"
        onClick={onCreateRelease}
        className="inline-flex h-11 w-full items-center justify-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover sm:hidden"
      >
        <Plus className="h-4 w-4" />
        New release
      </button>

      {releases.length === 0 ? (
        <div className="border border-stroke-default bg-bg-surface px-5 py-8 text-center">
          <p className="text-sm font-semibold text-content-primary">No releases yet</p>
          <p className="mt-1 text-xs text-content-secondary">
            Create your first release to start collecting tasks and assets.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {releases.map(({ release, tasksDone, tasksTotal }) => (
            <WorkspaceReleaseCard
              key={release.id}
              release={release}
              tasksDone={tasksDone}
              tasksTotal={tasksTotal}
              selected={scopedReleaseId === release.id}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </section>
  );
}
