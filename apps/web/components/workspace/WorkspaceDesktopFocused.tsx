'use client';

import { ArrowLeft } from 'lucide-react';
import type { Release } from '@/types/releases';
import type { Task } from '@/lib/tasks';
import { WorkspaceReleaseCard } from './WorkspaceReleaseCard';
import { TasksPanel } from './TasksPanel';
import type { ReleaseCardData } from './ReleasesColumn';

type WorkspaceDesktopFocusedProps = {
  /** Non-selected releases routed to the left rail. Split rule lives in
   * WorkspaceView (ceiling on left, stable by grid order). */
  leftRail: ReleaseCardData[];
  /** Non-selected releases routed to the right rail. */
  rightRail: ReleaseCardData[];
  /** Tasks already filtered to the scoped release. */
  scopedTasks: Task[];
  /** Slim release shape for the panels' pill/scope copy. */
  scopedRelease: Pick<Release, 'id' | 'title' | 'artistName'>;
  onSelect: (releaseId: string) => void;
  onClose: () => void;
};

/**
 * Desktop-only focused workspace surface. The 3-column grid pattern matches
 * the spec: non-selected releases redistribute to LEFT + RIGHT rails (split
 * computed in WorkspaceView so the same release always lands on the same
 * side across reselects), and the selected release sits in the centered
 * column above its scoped tasks + files. Mobile (< lg) never mounts this;
 * it uses the existing drill-down pattern in WorkspaceView.
 *
 * Reuses two components verbatim — `WorkspaceReleaseCard` for the centered
 * focus card and every rail card, and `TasksPanel` for the bucketed task list
 * (Done group + catch_up + drawer all flow through unchanged). Files and the
 * content calendar are their own pages, linked from TasksPanel's header
 * (URG-165, URG-157) — this file is purely arrangement: it doesn't reach
 * into any task, file, or asset logic.
 */
export function WorkspaceDesktopFocused({
  leftRail,
  rightRail,
  scopedTasks,
  scopedRelease,
  onSelect,
  onClose,
}: WorkspaceDesktopFocusedProps) {
  return (
    <div className="workspace-mode-enter space-y-4">
      {/* Back affordance — sits above the 3-column grid. The center card can
          ALSO be clicked to deselect (existing toggle in handleSelect), but
          a dedicated back button is the canonical close path. Deleting a
          release is Settings-only (URG-163) — no delete affordance lives
          here anymore. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Back to all releases"
        className="motion-focus motion-press inline-flex items-center gap-2 rounded-full border border-stroke-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to all releases
      </button>

      {/*
        Three-column layout. Rail widths step up at xl so the cards inside
        them stay roughly the same physical size as the at-rest grid cards
        (~220px at lg, ~260px at xl). The center column takes the remaining
        space via `minmax(0, 1fr)` — `min-w-0` semantics for grid items, so
        long task titles or wide release titles can truncate instead of
        forcing horizontal scroll. The rails are aligned to the top, not
        center, so the first rail card lines up with the centered card.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)_220px] xl:grid-cols-[260px_minmax(0,1fr)_260px]">
        <RailColumn cards={leftRail} onSelect={onSelect} ariaLabel="Other releases (left)" />

        <div className="min-w-0 space-y-6">
          {/* Center column body — the activities list fills the column. The
              focused release card moved into the TOPBAR (AppTopbar's
              ContextTitle: cover art + artist + title), founder call
              2026-07-23, so the list owns this space. Clicking a row opens
              the global activity pop-up. */}
          <TasksPanel tasks={scopedTasks} scopedRelease={scopedRelease} />
        </div>

        <RailColumn cards={rightRail} onSelect={onSelect} ariaLabel="Other releases (right)" />
      </div>
    </div>
  );
}

type RailColumnProps = {
  cards: ReleaseCardData[];
  onSelect: (releaseId: string) => void;
  ariaLabel: string;
};

function RailColumn({ cards, onSelect, ariaLabel }: RailColumnProps) {
  if (cards.length === 0) {
    // An empty rail still occupies its column track so the centered card
    // sits in the middle, not flush against the viewport edge. The track
    // is given a non-zero min-height of 0 — letting CSS Grid collapse it
    // would re-center the focused card and break visual symmetry.
    return <div aria-hidden="true" />;
  }
  return (
    <aside aria-label={ariaLabel} className="min-w-0 space-y-3">
      {cards.map(({ release, tasksDone, tasksTotal, coverArtUrl }) => (
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
    </aside>
  );
}
