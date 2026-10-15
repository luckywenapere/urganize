'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SIDEBAR_SLOT_ROLLOUT, useSidebarSlot } from '@/components/shell/Sidebar';
import { usePageBarCrumbSlot, usePageBarEndSlot } from '@/components/shell/PageBar';
import { ChevronRight, Plus } from '@/components/icons';
import { ReleaseDeliveredMark } from './ReleaseDeliveredMark';
import type { Release } from '@/types/releases';
import type { Task } from '@/lib/tasks';
import { TasksPanel } from './TasksPanel';
import { RolloutTabs } from './RolloutTabs';
import type { ReleaseCardData } from './catalogue-types';
import type { RolloutMenuDialogInput } from './useRolloutMenuActions';
import { displayStatus, statusGroup } from '@/lib/catalogue-table';

type WorkspaceDesktopFocusedProps = {
  /** Tasks already filtered to the scoped release. */
  scopedTasks: Task[];
  /** Slim release shape for the panel's scope copy. */
  scopedRelease: Pick<Release, 'id' | 'title' | 'artistName'> & Partial<Pick<Release, 'artistId' | 'releaseDate'>>;
  /** The focused rollout's card: cover, status, date, and who it is by. */
  card: ReleaseCardData;
  /** The "Catalogue" crumb's action. Owned entirely by WorkspaceView's
   * `goBack`, which closes an open scene first and only then leaves the
   * rollout; read it for the three cases. */
  onClose?: () => void;
  /** What the crumb announces. Computed by the caller, because only it knows
   * whether the next press closes a scene or leaves the rollout. */
  closeLabel?: string;
  /** Opens Quick Create for this rollout. Passed ONLY while the main view is
   * what is showing: a scene has taken the panel otherwise, and "add an
   * activity" pointed at nothing on screen is noise. Absent, no button. */
  onNewActivity?: () => void;
  /** Share, Change artist and Archive: dialogs WorkspaceView owns. They sit
   * behind the tab row's overflow button. */
  share?: RolloutMenuDialogInput | null;
  changeArtist?: RolloutMenuDialogInput | null;
  archive?: RolloutMenuDialogInput | null;
  /** Rendered above the TasksPanel inside the centre column: the one-time
   * NewReleaseGuide after a template creation. */
  banner?: ReactNode;
  /** Forwarded verbatim to TasksPanel's `sceneContent`: a release scene that
   * replaces the activity list in this column while it is open. */
  panelSceneContent?: ReactNode;
  /** Forwarded verbatim to TasksPanel's `activitiesBanner`. */
  panelActivitiesBanner?: ReactNode;
  panelActivitiesFooter?: ReactNode;
  /** Forwarded verbatim to TasksPanel's `bannerReplacesEmptyState`. */
  panelBannerReplacesEmptyState?: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  planning: 'Planning',
  in_progress: 'In progress',
  ready: 'Ready',
  released: 'Released',
  archived: 'Archived',
};

const STATUS_TONE: Record<ReturnType<typeof statusGroup>, string> = {
  planning: 'bg-status-info/10 text-status-info',
  active: 'bg-brand/10 text-brand',
  released: 'bg-status-success/10 text-status-success',
  archived: 'bg-bg-hover text-content-tertiary',
};

/**
 * Desktop-only focused rollout (design overhaul, 2026-10-04): a page bar line
 * (crumb, artist, status, progress, one primary action; trimmed 2026-10-15), the
 * rollout's places as a row of tabs, then the panel those tabs open into.
 *
 * It used to be a viewport-locked column beside a vertical menu and the UrgAns
 * chat. The menu is the tab row now and UrgAns is the floating drawer, so this
 * column has the whole width. Mobile (< lg) never mounts this; it keeps its
 * drill-down in WorkspaceView.
 *
 * Reuses `TasksPanel` for the activity list, the scene body and everything the
 * tasks do; this file is only arrangement.
 */
export function WorkspaceDesktopFocused({
  scopedTasks,
  scopedRelease,
  card,
  onClose,
  closeLabel,
  onNewActivity,
  share,
  changeArtist,
  archive,
  banner,
  panelSceneContent,
  panelActivitiesBanner,
  panelActivitiesFooter,
  panelBannerReplacesEmptyState,
}: WorkspaceDesktopFocusedProps) {
  const tasksTotal = scopedTasks.length;
  const tasksDone = scopedTasks.filter((t) => t.status === 'done').length;
  const rolloutMenuSlot = useSidebarSlot(SIDEBAR_SLOT_ROLLOUT);
  const crumbSlot = usePageBarCrumbSlot(true);
  const endSlot = usePageBarEndSlot(true);
  // The same derived status the Catalogue row shows, so opening a rollout
  // that read Released there does not say Draft here.
  const status = displayStatus({
    status: card.release.status,
    releaseDate: card.release.releaseDate,
    tasksDone,
    tasksTotal,
  });

  const crumb = (
    <div className="flex min-w-0 items-center gap-[13px]">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[15px] text-content-secondary">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel ?? 'Back to Catalogue'}
            className="motion-focus shrink-0 rounded-md hover:text-content-primary"
          >
            Rollouts
          </button>
        ) : (
          <span className="shrink-0">Rollouts</span>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-content-tertiary" aria-hidden="true" />
        <span className="min-w-0 truncate font-semibold text-content-primary">{card.release.title}</span>
      </nav>
      <span className="h-[21px] w-px shrink-0 bg-stroke-subtle" aria-hidden="true" />
      <span className="min-w-0 max-w-[14rem] truncate text-sm text-content-secondary">
        {scopedRelease.artistName || 'Unassigned artist'}
      </span>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 h-[21px] rounded-full px-2 text-xs font-medium ${STATUS_TONE[statusGroup(status)]}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
        {STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
      </span>
    </div>
  );

  const actions = (
    <div className="flex shrink-0 items-center gap-[13px]">
      {/* A hairline between the plan's tools and the page's own, shown only
          when the tools are on the line: 13 + 1 + 13 sits on the line's
          golden-ratio scale (8 / 13 / 21 / 34). */}
      <span
        className="hidden h-[21px] w-px bg-stroke-subtle group-has-[#subnav-slot-tools:not(:empty)]/pagebar:block"
        aria-hidden="true"
      />
      {/* One plain count (2026-10-14 declutter), worded like the
          distribution checklist's. */}
      <div className="hidden items-center gap-2 xl:flex">
        <span className="text-sm tabular-nums text-content-secondary">
          {tasksDone} of {tasksTotal} done
        </span>
        <ReleaseDeliveredMark total={tasksTotal} done={tasksDone} />
      </div>
      {onNewActivity ? (
        <button
          type="button"
          onClick={onNewActivity}
          className="motion-focus motion-press inline-flex h-[34px] shrink-0 items-center justify-center gap-2 rounded-full border border-stroke-control px-[13px] text-[13px] font-medium text-content-primary transition-colors hover:bg-bg-hover"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New activity
        </button>
      ) : null}
    </div>
  );

  // Viewport-locked, as it has always been: the page never scrolls here; long
  // lists scroll inside the panel so the header and tabs never leave view. The
  // 10.5rem is the shell around it: top bar 4.5rem + section row 3.5rem + main's
  // bottom padding 2.5rem. (Since URG-254 the section row is the page bar,
  // PageBar's h-14, so the sum is unchanged.)
  return (
    <div className="workspace-mode-enter flex h-[calc(100dvh-10.5rem)] min-h-[30rem] flex-col gap-4">
      <div className="shrink-0">
        {/* One line at the top (founder call, 2026-10-15): the page bar holds
            where you are (Rollouts > name), who it is by and its status on
            the left, the count and New activity on the right, all on the
            breadcrumb's line. The cover, the big title and the date that sat
            in a header under it are gone: the crumb already names the
            rollout, and the cover and date live in their own scenes. */}
        {crumbSlot ? createPortal(crumb, crumbSlot) : null}
        {endSlot ? createPortal(actions, endSlot) : null}
        {!crumbSlot || !endSlot ? (
          <div className="flex h-14 items-center gap-3">
            {crumbSlot ? null : crumb}
            <div className="flex-1" />
            {endSlot ? null : actions}
          </div>
        ) : null}

        {/* The rollout's menu (URG-254, founder call 2026-10-14): nested
            under Rollouts in the desktop side menu when it is on screen, and
            a row of tabs here when the side menu is folded away. */}
        {rolloutMenuSlot ? (
          createPortal(
            <RolloutTabs
              releaseId={scopedRelease.id}
              variant="side"
              share={share}
              changeArtist={changeArtist}
              archive={archive}
            />,
            rolloutMenuSlot
          )
        ) : (
          <div className="mt-4 border-b border-stroke-subtle pb-2">
            <RolloutTabs
              releaseId={scopedRelease.id}
              share={share}
              changeArtist={changeArtist}
              archive={archive}
            />
          </div>
        )}
      </div>

      {/* The panel. TasksPanel owns its own scroll, so this stacks the one-time
          banner above it and lets the panel's flex-1 fill the rest. */}
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
