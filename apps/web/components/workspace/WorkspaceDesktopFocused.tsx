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
  /** True while the Chappi slide-in panel is open (URL-agnostic — the caller
   * decides). Drops both rails to a single centered track so the 2/3-width
   * area stays readable instead of squeezing three columns into less
   * space. Rails return the moment the caller passes false again. */
  hideRails?: boolean;
};

/**
 * Desktop-only focused workspace surface. The 3-column grid pattern matches
 * the spec: non-selected releases redistribute to LEFT + RIGHT rails (split
 * computed in WorkspaceView so the same release always lands on the same
 * side across reselects), and the selected release's activities fill the
 * center column (its identity — art + title — renders in the topbar via
 * ContextTitle). Mobile (< lg) never mounts this; it uses the existing
 * drill-down pattern in WorkspaceView.
 *
 * Reuses two components verbatim — `WorkspaceReleaseCard` for every rail
 * card, and `TasksPanel` for the bucketed task list
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
  hideRails = false,
}: WorkspaceDesktopFocusedProps) {
  // Motion tracker data — done/total across the scoped release's activities
  // (same `status === 'done'` rule WorkspaceView uses for the grid cards).
  const tasksTotal = scopedTasks.length;
  const tasksDone = scopedTasks.filter((t) => t.status === 'done').length;
  const motionProgress = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;

  // Viewport-locked (founder call, 2026-07-23): the surface fills the space
  // under the topbar exactly — 100dvh minus the vertical chrome around it
  // (topbar 4rem + its 1px border + AppShell main pt-5/pb-10 = 3.75rem +
  // workspace pt-6 1.5rem; the wrapper drops its pb in focused mode). The page
  // never scrolls here; long activity lists and long rails scroll inside
  // their own columns, so the back button and context never leave view.
  return (
    <div className="workspace-mode-enter flex h-[calc(100dvh-9.25rem-1px)] min-h-[24rem] flex-col gap-4">
      {/* Top row — a COMPACT back affordance (icon-only; the old full-width
          "Back to all releases" label read too long — founder call,
          2026-07-23) with the release's motion tracker filling the freed
          space: label + progress bar + done/total count, same voice as the
          release cards' Motion strip. Deleting a release is Settings-only
          (URG-163) — no delete affordance lives here. */}
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to all releases"
          title="Back to all releases"
          className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
            Motion
          </span>
          <div className="h-1 min-w-0 flex-1 rounded-full bg-bg-elevated" aria-hidden="true">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${motionProgress}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] font-semibold text-content-primary">
            {tasksDone}/{tasksTotal}
          </span>
        </div>
      </div>

      {/*
        Three-column layout. Rail widths step up at xl so the cards inside
        them stay roughly the same physical size as the at-rest grid cards
        (~220px at lg, ~260px at xl). The center column takes the remaining
        space via `minmax(0, 1fr)` — `min-w-0` semantics for grid items, so
        long task titles or wide release titles can truncate instead of
        forcing horizontal scroll. The rails are aligned to the top, not
        center, so the first rail card lines up with the centered card.
      */}
      {/* grid-rows-[minmax(0,1fr)] pins the single row to the free space —
          without it the auto row grows with rail content (many releases →
          tall rails → the whole page scrolls again, defeating the lock). */}
      <div
        className={`grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-6 overflow-hidden ${
          hideRails
            ? 'grid-cols-[minmax(0,1fr)]'
            : 'lg:grid-cols-[220px_minmax(0,1fr)_220px] xl:grid-cols-[260px_minmax(0,1fr)_260px]'
        }`}
      >
        {hideRails ? null : (
          <RailColumn cards={leftRail} onSelect={onSelect} ariaLabel="Other releases (left)" />
        )}

        {/* Center column — the activities list fills and SCROLLS the column
            (the focused card lives in the topbar). Clicking a row opens the
            global activity pop-up. */}
        <div className="min-h-0 min-w-0 overflow-y-auto overscroll-contain pb-4 pr-1">
          <TasksPanel tasks={scopedTasks} scopedRelease={scopedRelease} />
        </div>

        {hideRails ? null : (
          <RailColumn cards={rightRail} onSelect={onSelect} ariaLabel="Other releases (right)" />
        )}
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
    <aside
      aria-label={ariaLabel}
      className="min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain pb-4"
    >
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
