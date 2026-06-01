'use client';

import { Plus } from 'lucide-react';
import type { Release } from '@/types/releases';
import { EmptyState } from '@/components/shared/EmptyState';
import { WorkspaceReleaseCard } from './WorkspaceReleaseCard';

export type ReleaseCardData = {
  release: Pick<Release, 'id' | 'title' | 'artistName' | 'status' | 'releaseDate'>;
  tasksDone: number;
  tasksTotal: number;
  /** Signed Phase 3 cover-art URL; null/undefined surfaces the neutral
   * placeholder in WorkspaceReleaseCard. */
  coverArtUrl?: string | null;
};

type ReleasesColumnProps = {
  releases: ReleaseCardData[];
  scopedReleaseId: string | null;
  onSelect: (releaseId: string) => void;
  /** Opens the create-release modal. Surfaces as a full-width button below
   * sm where the AppTopbar's "New release" button is hidden. */
  onCreateRelease: () => void;
};

export function ReleasesColumn({
  releases,
  scopedReleaseId,
  onSelect,
  onCreateRelease,
}: ReleasesColumnProps) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
        Releases
      </h2>

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
        <EmptyState
          title="No releases yet"
          description="Create your first release to start collecting tasks and assets."
          action={
            <button
              type="button"
              onClick={onCreateRelease}
              className="inline-flex h-10 items-center justify-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
            >
              <Plus className="h-4 w-4" />
              Create release
            </button>
          }
        />
      ) : (
        // Card grid: 2-up below lg (stacked layout — phones / tablets),
        // 3-up at lg+ (inside the 2-pane workspace, the Releases column is
        // ~566px at 1280 viewport — 3-up gives ~180px cards with the square
        // cover art shrinking proportionally, instead of the 2-up ~277px
        // banners that wasted vertical space).
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {releases.map(({ release, tasksDone, tasksTotal, coverArtUrl }) => (
            <WorkspaceReleaseCard
              key={release.id}
              release={release}
              tasksDone={tasksDone}
              tasksTotal={tasksTotal}
              selected={scopedReleaseId === release.id}
              onSelect={onSelect}
              coverArtUrl={coverArtUrl}
            />
          ))}
        </div>
      )}
    </section>
  );
}
