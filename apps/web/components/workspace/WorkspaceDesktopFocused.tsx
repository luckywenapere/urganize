'use client';

import type { ReactNode } from 'react';
import { ArrowLeft } from '@/components/icons';
import { ReleaseDeliveredMark } from './ReleaseDeliveredMark';
import type { Release } from '@/types/releases';
import type { Task } from '@/lib/tasks';
import { WorkspaceReleaseCard } from './WorkspaceReleaseCard';
import { TasksPanel, type TaskPanelAction } from './TasksPanel';
import type { ReleaseCardData } from './ReleasesColumn';

// URG-214: when the workspace identity card is on, it occupies a 240px
// column (plus its own 32px gap) at lg+, same tier this grid's rails start
// at. Left unchanged, the identity panel + a 260px xl rail + this center
// column would squeeze badly on 1024-1366px laptops. So with the flag on,
// both rails wait for xl (where the identity panel's own rule already hides
// it in favor of the UrgAns rail — the two never compete) and skip the
// 260px xl bump, holding steady at 220px instead.
const IDENTITY_PANEL_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

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
  /** True while the Chappi slide-in panel is open (URL-agnostic — the caller
   * decides). Drops both rails to a single centered track so the 2/3-width
   * area stays readable instead of squeezing three columns into less
   * space. Rails return the moment the caller passes false again. */
  hideRails?: boolean;
  /** Rendered above the TasksPanel inside the scrolling center column — the
   * one-time NewReleaseGuide after a template creation (2026-08-04, ported
   * from the removed release detail page). */
  banner?: ReactNode;
  panelArchiveAction?: TaskPanelAction | null;
  panelChangeArtistAction?: TaskPanelAction | null;
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
  /** Forwarded to TasksPanel: show the Plan pill in the scene switcher. */
  panelShowPlanPill?: boolean;
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
  closeLabel,
  hideRails = false,
  banner,
  panelArchiveAction,
  panelChangeArtistAction,
  panelSceneContent,
  panelActivitiesBanner,
  panelActivitiesFooter,
  panelBannerReplacesEmptyState,
  panelShowPlanPill,
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
            : IDENTITY_PANEL_ENABLED
              // Base (this component's floor is already lg — see the
              // `hidden lg:block` wrapper in WorkspaceView) is a single
              // column until xl, where the identity panel has already
              // ceded the width back (its own rule hides it once the
              // UrgAns rail opens, and it's not present at all past that
              // point competing with these rails).
              ? 'grid-cols-[minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_220px]'
              : 'lg:grid-cols-[220px_minmax(0,1fr)_220px] xl:grid-cols-[260px_minmax(0,1fr)_260px]'
        }`}
      >
        {hideRails ? null : (
          <RailColumn
            cards={leftRail}
            onSelect={onSelect}
            ariaLabel="Other releases (left)"
            hiddenBelowXl={IDENTITY_PANEL_ENABLED}
          />
        )}

        {/* Center column — a plain flex-column frame now (2026-08-05):
            TasksPanel owns its own scroll internally (a sticky pill row +
            a scrollable body), so this just stacks the one-time banner above
            it and lets TasksPanel's `flex-1` stretch to fill the remaining
            grid-track height. Clicking an activity row opens the global
            activity pop-up. */}
        <div className="flex min-h-0 min-w-0 flex-col">
          {banner}
          <TasksPanel
            tasks={scopedTasks}
            scopedRelease={scopedRelease}
            archiveAction={panelArchiveAction}
            changeArtistAction={panelChangeArtistAction}
            sceneContent={panelSceneContent}
            activitiesBanner={panelActivitiesBanner}
            activitiesFooter={panelActivitiesFooter}
            bannerReplacesEmptyState={panelBannerReplacesEmptyState}
            showPlanPill={panelShowPlanPill}
          />
        </div>

        {hideRails ? null : (
          <RailColumn
            cards={rightRail}
            onSelect={onSelect}
            ariaLabel="Other releases (right)"
            hiddenBelowXl={IDENTITY_PANEL_ENABLED}
          />
        )}
      </div>
    </div>
  );
}

type RailColumnProps = {
  cards: ReleaseCardData[];
  onSelect: (releaseId: string) => void;
  ariaLabel: string;
  /** URG-214: with the identity panel on, the grid template itself doesn't
   * open a rail column until xl (see the parent's className above) — but
   * the grid still auto-places whatever DOM children exist. Below xl this
   * hides the rail visually so it doesn't consume the single-column track
   * meant for the center content. */
  hiddenBelowXl?: boolean;
};

function RailColumn({ cards, onSelect, ariaLabel, hiddenBelowXl = false }: RailColumnProps) {
  const visibilityClass = hiddenBelowXl ? 'hidden xl:block' : '';

  if (cards.length === 0) {
    // An empty rail still occupies its column track so the centered card
    // sits in the middle, not flush against the viewport edge. The track
    // is given a non-zero min-height of 0 — letting CSS Grid collapse it
    // would re-center the focused card and break visual symmetry.
    return <div aria-hidden="true" className={visibilityClass} />;
  }
  return (
    <aside
      aria-label={ariaLabel}
      className={`min-h-0 min-w-0 space-y-3 overflow-y-auto overscroll-contain pb-4 ${visibilityClass}`}
    >
      {cards.map(({ release, tasksDone, tasksTotal, coverArtUrl, isTest }) => (
        <WorkspaceReleaseCard
          key={release.id}
          release={release}
          tasksDone={tasksDone}
          tasksTotal={tasksTotal}
          selected={false}
          onSelect={onSelect}
          coverArtUrl={coverArtUrl}
          isTest={isTest}
        />
      ))}
    </aside>
  );
}
