'use client';

import { countProgress } from '@/lib/task-progress';
import { onlyPreProductionWork } from '@/lib/pre-production';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePageBarCrumbSlot, usePageBarEndSlot } from '@/components/shell/PageBar';
import { ChevronRight, Plus, Sparkles } from '@/components/icons';
import { ReleaseDeliveredMark } from './ReleaseDeliveredMark';
import type { Release } from '@/types/releases';
import type { Task } from '@/lib/tasks';
import { TasksPanel } from './TasksPanel';
import { RolloutTabs } from './RolloutTabs';
import { PlanMenuPillDock } from './PlanMenuPill';
import { BriefBackButton, BriefEntryButton } from './BriefEntry';
import { usePlanMenuFold } from '@/stores/usePlanMenuFold';
import type { ReleaseCardData } from './catalogue-types';
import type { RolloutMenuDialogInput } from './useRolloutMenuActions';
import { displayStatus, statusGroup } from '@/lib/catalogue-table';
import { RolloutOutNowLink } from './RolloutOutNowLink';

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
  /** Opens the idea box on a planned rollout. Absent, no button. */
  onAddIdea?: () => void;
  /** Share and Archive: dialogs WorkspaceView owns. They sit behind the tab
   * row's overflow button. Change artist left the menu on Oct 18, 2026; it is
   * offered only in the distribution issue list now. */
  share?: RolloutMenuDialogInput | null;
  archive?: RolloutMenuDialogInput | null;
  /** Delete rollout (to Trash), owner-only. */
  deleteRollout?: RolloutMenuDialogInput | null;
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
  /**
   * The simple plan view (2026-10-26): a plan with no release day. The date
   * step and the idea sit in a side column beside the task list, and the list
   * itself drops its toolbar and group headers.
   */
  simpleSide?: ReactNode;
  /**
   * A brand-new rollout with no activities (2026-10-26): the page scrolls like
   * any other instead of being locked to the viewport, and the cards above the
   * panel sit side by side, so the planner card below is never squeezed out.
   */
  pageScroll?: boolean;
  /**
   * The brief is open (#902): it takes the whole page. The tabs, the plan's
   * tools and the banners step aside, and the crumb becomes one way back.
   */
  briefOpen?: boolean;
  /** Closes the brief, back to the plan (the main view). */
  onCloseBrief?: () => void;
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
  onAddIdea,
  share,
  archive,
  deleteRollout,
  banner,
  panelSceneContent,
  panelActivitiesBanner,
  panelActivitiesFooter,
  panelBannerReplacesEmptyState,
  simpleSide,
  pageScroll = false,
  briefOpen = false,
  onCloseBrief,
}: WorkspaceDesktopFocusedProps) {
  // Cancelled work is out of both numbers (URG-389).
  const { done: tasksDone, total: tasksTotal } = countProgress(scopedTasks);
  // A fresh rollout (no release day yet, or only the seeded pre-production
  // starters) shows no count and no New activity (2026-10-26, declutter).
  const hasPlan = Boolean(card.release.releaseDate) && !onlyPreProductionWork(scopedTasks);
  // Any plan, dated or not, has a brief to open from it (#902).
  const planBuilt = scopedTasks.length > 0 && !onlyPreProductionWork(scopedTasks);
  // A small swipe down the plan folds the tabs and tools away (#898); the
  // gestures run in WorkspaceView, which knows when the plan is showing.
  const menuFolded = usePlanMenuFold((state) => state.folded);
  const crumbSlot = usePageBarCrumbSlot(true);
  const endSlot = usePageBarEndSlot(true);
  // True once the tab row has scrolled up to the top bar and is holding there.
  const tabsSentinelRef = useRef<HTMLDivElement | null>(null);
  const [tabsStuck, setTabsStuck] = useState(false);
  useEffect(() => {
    const node = tabsSentinelRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setTabsStuck(!entry.isIntersecting && entry.boundingClientRect.top < 80),
      { rootMargin: '-72px 0px 0px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // The same derived status the Catalogue row shows, so opening a rollout
  // that read Released there does not say Draft here.
  const status = displayStatus({
    status: card.release.status,
    releaseDate: card.release.releaseDate,
    tasksDone,
    tasksTotal,
  });

  // The brief on the whole screen (#902): one way back, then what you are reading.
  const focus = briefOpen && onCloseBrief;
  const briefCrumb = focus ? (
    <div className="flex min-w-0 items-center gap-[13px]">
      <BriefBackButton label={planBuilt ? 'Back to the plan' : 'Back to the ideas'} onBack={onCloseBrief} />
      <p className="min-w-0 truncate text-[15px] text-content-secondary">
        <span className="font-semibold text-content-primary">{card.release.title}</span> · Brief
      </p>
    </div>
  ) : null;

  const crumb = briefCrumb ?? (
    <div className="flex min-w-0 items-center gap-[13px]">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[15px] text-content-secondary">
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel ?? 'Back to Home'}
            className="motion-focus shrink-0 rounded-md hover:text-content-primary"
          >
            Home
          </button>
        ) : (
          <span className="shrink-0">Home</span>
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

  const actions = focus ? null : (
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
      {hasPlan ? (
        <div className="hidden items-center gap-2 xl:flex">
          <span className="text-sm tabular-nums text-content-secondary">
            {tasksDone} of {tasksTotal} done
          </span>
          <ReleaseDeliveredMark total={tasksTotal} done={tasksDone} />
        </div>
      ) : null}
      {/* The brief's door (#902): on the line that never folds, so it is there
          the whole way down the plan. */}
      {planBuilt ? (
        <BriefEntryButton
          releaseId={scopedRelease.id}
          title={card.release.title}
          coverUrl={card.coverThumbUrl ?? card.coverArtUrl}
        />
      ) : null}
      {onAddIdea && hasPlan ? (
        <button
          type="button"
          onClick={onAddIdea}
          className="motion-focus motion-press inline-flex h-[34px] shrink-0 items-center justify-center gap-2 rounded-full border border-stroke-control px-[13px] text-[13px] font-medium text-content-primary transition-colors hover:bg-bg-hover"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Add idea
        </button>
      ) : null}
      {onNewActivity && hasPlan ? (
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

  // The page scrolls (2026-10-26, founder: "let it move with the page so users
  // can breathe"): the header and tabs scroll away with the list instead of
  // staying pinned while the list scrolls inside a box. It still fills the
  // screen when short. The 10.5rem is the shell around it: top bar 4.5rem +
  // page bar 3.5rem + main's bottom padding 2.5rem.
  return (
    <div
      className={`workspace-mode-enter flex flex-col gap-4 ${
        pageScroll ? '' : 'min-h-[calc(100dvh-10.5rem)]'
      }`}
    >
      <div className="shrink-0">
        {/* One line at the top (founder call, 2026-10-15): the page bar holds
            where you are (Rollouts > name), who it is by and its status on
            the left, the count and New activity on the right, all on the
            breadcrumb's line. The cover, the big title and the date that sat
            in a header under it are gone: the crumb already names the
            rollout, and the cover and date live in their own scenes. */}
        {crumbSlot ? createPortal(crumb, crumbSlot) : null}
        {endSlot && actions ? createPortal(actions, endSlot) : null}
        {!crumbSlot || !endSlot ? (
          <div className="flex h-14 items-center gap-3">
            {crumbSlot ? null : crumb}
            <div className="flex-1" />
            {endSlot ? null : actions}
          </div>
        ) : null}
      </div>

      {/* The rollout's menu: a row of tabs (the side menu no longer opens,
          2026-10-26). The row scrolls up with the page, then holds just under
          the top bar (2026-10-26, founder), gaining a background and a soft
          shadow as it locks. It sits outside the header block above, so it can
          stick for the whole page and not only inside that block. */}
      {/* Once the song is out, its smart link sits above the tabs (#1092). */}
      {focus ? null : (
        <RolloutOutNowLink releaseId={scopedRelease.id} releaseDate={scopedRelease.releaseDate} title={scopedRelease.title} className="max-w-xl" />
      )}
      <div ref={tabsSentinelRef} aria-hidden="true" className="-mb-4 h-0" />
      {/* Folded (#898), the pill floats 34 above the bottom of the screen
          (#926), centred on the plan, so the menu is one tap away mid-plan
          too without covering the top of the plan. */}
      {menuFolded && !focus ? <PlanMenuPillDock anchorClassName="-mb-4" /> : null}
      <div
        data-stuck={tabsStuck ? '' : undefined}
        className={`${menuFolded || focus ? 'hidden' : ''} sticky top-[72px] z-20 -mx-8 border-b border-stroke-subtle bg-bg-base px-8 pb-2 pt-0 transition-[padding,box-shadow] duration-200 ease-out data-[stuck]:pt-2 data-[stuck]:shadow-[0_8px_16px_-12px_rgb(0_0_0/0.6)]`}
      >
        <RolloutTabs
          releaseId={scopedRelease.id}
          share={share}
          archive={archive}
          deleteRollout={deleteRollout}
        />
      </div>

      {/* The panel: the one-time banner above it, the panel below, all on the
          page's own scroll. */}
      <div
        className={
          simpleSide
            ? 'grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_20rem] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]'
            : pageScroll
              ? 'flex min-w-0 flex-col gap-4'
              : 'flex min-w-0 flex-1 flex-col'
        }
      >
        {simpleSide || focus ? null : pageScroll ? (
          <div className="order-1 grid grid-cols-2 items-start gap-4 [&>*:only-child]:col-span-2">{banner}</div>
        ) : (
          banner
        )}
        <div className={pageScroll ? 'order-2 flex min-w-0 flex-col' : 'flex min-w-0 flex-1 flex-col'}>
          <TasksPanel
            tasks={scopedTasks}
            scopedRelease={scopedRelease}
            sceneContent={panelSceneContent}
            activitiesBanner={simpleSide ? undefined : panelActivitiesBanner}
            activitiesFooter={panelActivitiesFooter}
            bannerReplacesEmptyState={panelBannerReplacesEmptyState}
            simple={Boolean(simpleSide)}
          />
        </div>
        {simpleSide ? <div className="flex flex-col gap-3">{simpleSide}</div> : null}
      </div>
    </div>
  );
}
