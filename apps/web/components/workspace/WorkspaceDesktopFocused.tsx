'use client';

import type { ReactNode } from 'react';
import { ArrowLeft, Plus } from '@/components/icons';
import { ReleaseDeliveredMark } from './ReleaseDeliveredMark';
import type { Release } from '@/types/releases';
import type { Task } from '@/lib/tasks';
import { TasksPanel, taskPanelPillClass } from './TasksPanel';

type WorkspaceDesktopFocusedProps = {
  /** Tasks already filtered to the scoped release. */
  scopedTasks: Task[];
  /** Slim release shape for the panel's scope copy. */
  scopedRelease: Pick<Release, 'id' | 'title' | 'artistName'>;
  /** The back arrow's action. Owned entirely by WorkspaceView's `goBack`, which
   * closes an open scene first and only then leaves the release — read it for
   * the three cases.
   *
   * THIS COMMENT USED TO SAY the prop is "omitted when there is no catalog worth
   * returning to — a workspace with a single release scopes to it
   * automatically", implying the arrow is deliberately absent for those
   * accounts. That was never true of the code: the only call site always passes
   * it, so the arrow always renders in focused mode. The claim is worth recording
   * because it is why a genuinely dead button read as intentional for so long. */
  onClose?: () => void;
  /** What the arrow announces. Computed by the caller, because only it knows
   * whether the next press closes a scene or leaves the release; a hardcoded
   * "Back to all releases" was wrong in two of the three cases. */
  closeLabel?: string;
  /** Opens Quick Create for this rollout. The caller passes it ONLY while the
   * main view (the timeline, or the activity buckets) is what is showing: a
   * scene has taken the panel then, and "add an activity" pointed at nothing
   * on screen is noise. Absent, the button does not render. */
  onNewActivity?: () => void;
  /** Rendered above the TasksPanel inside the centre column — the one-time
   * NewReleaseGuide after a template creation (2026-08-04, ported from the
   * removed release detail page). */
  banner?: ReactNode;
  /** Forwarded verbatim to TasksPanel's `sceneContent` — a release scene
   * (Metadata / Calendar / Files / Press kit) that replaces the activity
   * buckets in this centre column while it's open (2026-08-05). */
  panelSceneContent?: ReactNode;
  /** Forwarded verbatim to TasksPanel's `activitiesBanner` — the
   * SetReleaseDateCard, shown at the top of the activity list when the
   * scoped release has no release date (2026-08-06, URG-230). */
  panelActivitiesBanner?: ReactNode;
  panelActivitiesFooter?: ReactNode;
  /** Forwarded verbatim to TasksPanel's `bannerReplacesEmptyState`
   * (2026-08-06, URG-233). */
  panelBannerReplacesEmptyState?: boolean;
};

/**
 * Desktop-only focused workspace surface: the selected release's activities in
 * one centre column, under a top row with the back arrow, the motion tracker
 * and the New activity button. The release's identity (art + title) renders in
 * the topbar via ContextTitle. Mobile (< lg) never mounts this; it uses the
 * existing drill-down pattern in WorkspaceView.
 *
 * THIS WAS A THREE-COLUMN GRID until 2026-09-30. The other rollouts sat on
 * either side of the focused one as two rails of cards, and the rollout's
 * scene pills sat in a row on top of the centre column. Both are gone: the
 * scene pills became the vertical menu at the top of the right-hand column
 * (RightRail, with the UrgAns chat under it), and the side cards went with them
 * (founder call). Nothing was stranded: the catalog is one press of the back
 * arrow away, and a rollout card there is one click. What the removal buys is
 * width — the centre column is the whole of `<main>` now, instead of `<main>`
 * less 488px of rails — which is what keeps the timeline and the content
 * calendar on their grids next to a permanent right-hand column.
 *
 * Reuses `TasksPanel` for the bucketed task list (Done group + catch_up +
 * drawer all flow through unchanged). This file is purely arrangement: it
 * doesn't reach into any task, file, or asset logic.
 */
export function WorkspaceDesktopFocused({
  scopedTasks,
  scopedRelease,
  onClose,
  closeLabel,
  onNewActivity,
  banner,
  panelSceneContent,
  panelActivitiesBanner,
  panelActivitiesFooter,
  panelBannerReplacesEmptyState,
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
  // never scrolls here; long activity lists scroll inside their own column, so
  // the back button and context never leave view.
  return (
    <div className="workspace-mode-enter flex h-[calc(100dvh-9.25rem-1px)] min-h-[24rem] flex-col gap-4">
      {/* Top row — a COMPACT back affordance (icon-only; the old full-width
          "Back to all releases" label read too long — founder call,
          2026-07-23) with the release's motion tracker filling the freed
          space: label + progress bar + done/total count, same voice as the
          release cards' Motion strip, and the New activity button at the far
          end (moved here from the row of scene pills, 2026-09-30, so the one
          action that is not a place to go sits with the release's own status
          rather than among the places). Deleting a release is Settings-only
          (URG-163) — no delete affordance lives here. ONE sanctioned
          exception since 2026-09-01 (founder call): a TEST release's
          standing banner (TestReleaseBanner, via the activitiesBanner slot)
          carries its own "Delete test release" button, because the founder
          asked for the test path to end with the delete option. Real
          releases keep the Settings-only rule; the per-release trash icons
          stay removed. */}
      <div className="flex shrink-0 items-center gap-4">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel ?? 'Back'}
            title={closeLabel ?? 'Back'}
            className="motion-focus motion-press grid h-8 w-8 shrink-0 place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-content-tertiary">
            Motion
          </span>
          {/* Track uses stroke-strong, not bg-bg-elevated (2026-08-04, founder
              contrast fix) — see WorkspaceView.tsx's mobile Motion tracker for
              the full rationale; same bar, same fix. */}
          <div className="h-1.5 min-w-0 flex-1 rounded-full bg-stroke-strong" aria-hidden="true">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${motionProgress}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11px] font-semibold text-content-primary">
            {tasksDone}/{tasksTotal}
          </span>
          <ReleaseDeliveredMark total={tasksTotal} done={tasksDone} />
        </div>

        {onNewActivity ? (
          <button type="button" onClick={onNewActivity} className={taskPanelPillClass}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New activity
          </button>
        ) : null}
      </div>

      {/* Centre column — a plain flex-column frame: TasksPanel owns its own
          scroll internally (a scrollable body), so this just stacks the
          one-time banner above it and lets TasksPanel's `flex-1` stretch to
          fill the remaining height. `overflow-hidden` is what holds the
          viewport lock: a long list scrolls inside the panel, never the page.
          Clicking an activity row opens the global activity pop-up. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {banner}
        <TasksPanel
          tasks={scopedTasks}
          scopedRelease={scopedRelease}
          sceneContent={panelSceneContent}
          activitiesBanner={panelActivitiesBanner}
          activitiesFooter={panelActivitiesFooter}
          bannerReplacesEmptyState={panelBannerReplacesEmptyState}
        />
      </div>
    </div>
  );
}
