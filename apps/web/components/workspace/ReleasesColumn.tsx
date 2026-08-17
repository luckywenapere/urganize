'use client';

import { Plus } from 'lucide-react';
import type { Release } from '@/types/releases';
import { EmptyState } from '@/components/shared/EmptyState';
import { WorkspaceReleaseCard } from './WorkspaceReleaseCard';

// MobileNavBar's center "+" (NEXT_PUBLIC_FEATURE_MOBILE_NAV) already opens
// the same create-release flow, so the full-width button this component
// used to render below `sm` was retired to avoid a double CTA — see the
// identical reasoning on AppTopbar's own "New release" button.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

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
      {/* Mobile-only full-width "New release". AppTopbar's New release button
          is `hidden sm:inline-flex`; this fills the gap below 640px. Hidden
          when MobileNavBar is on — its center "+" already covers this. */}
      {!MOBILE_NAV_ENABLED ? (
        <button
          type="button"
          onClick={onCreateRelease}
          className="motion-focus motion-press flex h-11 w-full items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover sm:hidden"
        >
          <Plus className="h-4 w-4" />
          New release
        </button>
      ) : null}

      {releases.length === 0 ? (
        <EmptyState
          title="No releases yet"
          description="Create your first release to start planning activities."
          action={
            <button
              type="button"
              onClick={onCreateRelease}
              className="motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Create release
            </button>
          }
        />
      ) : (
        // Full-width horizontal ROWS — square art thumbnail beside the meta
        // (the `focused` card variant), one per line at every width this
        // component renders at (it only ever mounts inside WorkspaceView's
        // `lg:hidden` branch).
        //
        // Supersedes the golden-section treatment (founder call, 2026-08-07).
        // History, so this isn't re-litigated: cards originally ran edge to
        // edge as tiles, and the square cover art ballooned into a
        // full-screen banner (founder call, 2026-07-23); the fix capped each
        // tile at 100vw/φ ≈ 61.8vw and centered it. That killed the balloon
        // but left ~38% of a 390px screen empty with only ~1.9 releases
        // visible per screen — filling neither axis.
        //
        // Rows fix both at once: the art is bounded by the row's fixed
        // thumbnail width (w-28/sm:w-36) rather than the viewport, so it
        // physically cannot balloon, while the meta column absorbs the full
        // width. ~4-5 releases per screen. It's also the same card the
        // desktop focused view uses, so phone and desktop speak one language.
        <div className="space-y-3">
          {releases.map(({ release, tasksDone, tasksTotal, coverArtUrl }) => (
            <WorkspaceReleaseCard
              key={release.id}
              release={release}
              tasksDone={tasksDone}
              tasksTotal={tasksTotal}
              selected={scopedReleaseId === release.id}
              onSelect={onSelect}
              coverArtUrl={coverArtUrl}
              variant="focused"
            />
          ))}
        </div>
      )}
    </section>
  );
}
