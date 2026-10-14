'use client';

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { SIDEBAR_SLOT_ROLLOUT, useSidebarSlot } from '@/components/shell/Sidebar';
import { usePageBarCrumbSlot } from '@/components/shell/PageBar';
import Image from 'next/image';
import { ChevronRight, Plus } from '@/components/icons';
import { ReleaseDeliveredMark } from './ReleaseDeliveredMark';
import type { Release } from '@/types/releases';
import type { Task } from '@/lib/tasks';
import { TasksPanel } from './TasksPanel';
import { RolloutTabs } from './RolloutTabs';
import type { ReleaseCardData } from './catalogue-types';
import { ArtistFace } from '@/components/shared/ArtistFace';
import type { RolloutMenuDialogInput } from './useRolloutMenuActions';
import { displayStatus, statusGroup } from '@/lib/catalogue-table';

type WorkspaceDesktopFocusedProps = {
  /** Tasks already filtered to the scoped release. */
  scopedTasks: Task[];
  /** Slim release shape for the panel's scope copy. */
  scopedRelease: Pick<Release, 'id' | 'title' | 'artistName'> & Partial<Pick<Release, 'artistId'>>;
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

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
}

/**
 * Desktop-only focused rollout (design overhaul, 2026-10-04): a Deel-style page
 * header (crumb, cover, title, status, date, progress, one primary action), the
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
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const rolloutMenuSlot = useSidebarSlot(SIDEBAR_SLOT_ROLLOUT);
  const crumbSlot = usePageBarCrumbSlot(true);
  const showCover = Boolean(card.coverArtUrl) && card.coverArtUrl !== failedCover;
  const date = formatDate(card.release.releaseDate);
  // The same derived status the Catalogue row shows, so opening a rollout
  // that read Released there does not say Draft here.
  const status = displayStatus({
    status: card.release.status,
    releaseDate: card.release.releaseDate,
    tasksDone,
    tasksTotal,
  });

  // Viewport-locked, as it has always been: the page never scrolls here; long
  // lists scroll inside the panel so the header and tabs never leave view. The
  // 10.5rem is the shell around it: top bar 4.5rem + section row 3.5rem + main's
  // bottom padding 2.5rem. (Since URG-254 the section row is the page bar,
  // PageBar's h-14, so the sum is unchanged.)
  return (
    <div className="workspace-mode-enter flex h-[calc(100dvh-10.5rem)] min-h-[30rem] flex-col gap-4">
      <div className="shrink-0">
        {/* Where you are, said once (2026-10-14 declutter): the breadcrumb
            takes the page bar's title slot, so the page bar, a breadcrumb row
            and the heading no longer all say Rollouts. */}
        {crumbSlot
          ? createPortal(
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[15px] text-content-secondary">
                {onClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label={closeLabel ?? 'Back to Catalogue'}
                    className="motion-focus rounded-md hover:text-content-primary"
                  >
                    Rollouts
                  </button>
                ) : (
                  <span>Rollouts</span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-content-tertiary" aria-hidden="true" />
                <span className="min-w-0 truncate font-semibold text-content-primary">{card.release.title}</span>
              </nav>,
              crumbSlot
            )
          : null}

        <div className="flex items-center gap-4 pt-1">
          {/* The cover only when there is one (2026-10-14 declutter): an
              empty tile with the mark in it said nothing, and Add cover art
              is in the menu. */}
          {showCover ? (
            <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-bg-elevated" aria-hidden="true">
              <Image
                src={card.coverArtUrl as string}
                alt=""
                fill
                sizes="56px"
                unoptimized
                className="object-cover"
                onError={() => setFailedCover(card.coverArtUrl ?? null)}
              />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate font-display text-2xl font-semibold leading-tight text-content-primary">
                {card.release.title}
              </h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[statusGroup(status)]}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                {STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-content-secondary">
              <ArtistFace artistId={scopedRelease.artistId} name={scopedRelease.artistName} size={20} />
              <span className="truncate">
                {scopedRelease.artistName || 'Unassigned artist'}
                {date ? <span className="text-content-tertiary"> · {date}</span> : null}
              </span>
            </p>
          </div>

          {/* One plain count instead of a bar and a mono fraction (2026-10-14
              declutter), worded like the distribution checklist's. */}
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
              className="motion-focus motion-press inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full border border-stroke-control px-4 text-sm font-medium text-content-primary transition-colors hover:bg-bg-hover"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New activity
            </button>
          ) : null}
        </div>

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
