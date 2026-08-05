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
    // No "Releases" eyebrow (founder call, 2026-07-23): the centered grid
    // IS the page — a left-anchored label over a centered row read as
    // misaligned, and the topbar already orients the user.
    <section className="workspace-mode-enter space-y-4">
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
        // Auto-fit columns capped at 260px, centered as a row (founder call,
        // 2026-07-23; cap tightened 260<-280 on 2026-08-05, URG-214 follow-up):
        // with `repeat(auto-fit, minmax(...))` the browser fits as many
        // ~260px columns as the container allows, and `justify-center`
        // centers the row when there are FEWER releases than fit, instead of
        // leaving them left-anchored with dead space to the right.
        // `auto-fit`'s track count is computed from the MAX bound, not the
        // min — so with the workspace identity panel + the open UrgAns rail
        // both on screen (the common case once both ship), the center column
        // narrows to ~555px, and the old 280px cap meant 2*280+gap (576px)
        // didn't fit, collapsing to a single column even though there was
        // clearly room for two. 260px clears that squeeze (2*260+gap = 536px)
        // while keeping the same look everywhere else.
        <div className="grid justify-center gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,260px))]">
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
