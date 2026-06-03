'use client';

import { Plus } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { WorkspaceReleaseCard } from './WorkspaceReleaseCard';
import type { ReleaseCardData } from './ReleasesColumn';

type WorkspaceDesktopGridProps = {
  releases: ReleaseCardData[];
  onSelect: (releaseId: string) => void;
  onCreateRelease: () => void;
};

/**
 * Desktop-only at-rest workspace surface. With no release selected, the
 * workspace shows ONLY releases — no tasks panel, no files panel. The
 * grid fills the entire main area: 3-up at lg, 4-up at xl. Mobile (< lg)
 * never mounts this; it uses the existing `ReleasesColumn` drill-down
 * pattern in WorkspaceView.
 *
 * The card row reuses `WorkspaceReleaseCard` exactly as the previous
 * layout did — this is purely an arrangement change driven by selection
 * state. Clicking any card writes `?release=<id>` via the parent's
 * `onSelect`, which flips WorkspaceView into the focused 3-column shape.
 */
export function WorkspaceDesktopGrid({
  releases,
  onSelect,
  onCreateRelease,
}: WorkspaceDesktopGridProps) {
  return (
    <section className="workspace-mode-enter space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Releases
        </h2>
      </div>

      {releases.length === 0 ? (
        <EmptyState
          title="No releases yet"
          description="Create your first release to start collecting tasks and assets."
          action={
            <button
              type="button"
              onClick={onCreateRelease}
              className="motion-focus motion-press inline-flex h-10 items-center justify-center gap-2 border border-brand/25 bg-brand px-4 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
            >
              <Plus className="h-4 w-4" />
              Create release
            </button>
          }
        />
      ) : (
        // 3-up at lg (1024px → ~285px cards) and 4-up at xl (1280px+ →
        // ~280px cards). The wider real estate vs. the old 2-pane left
        // column means we can show more releases above the fold at rest
        // without resizing the underlying card primitive.
        <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {releases.map(({ release, tasksDone, tasksTotal, coverArtUrl }) => (
            <WorkspaceReleaseCard
              key={release.id}
              release={release}
              tasksDone={tasksDone}
              tasksTotal={tasksTotal}
              selected={false}
              onSelect={onSelect}
              coverArtUrl={coverArtUrl}
            />
          ))}
        </div>
      )}
    </section>
  );
}
