'use client';

import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Chappi, CHAPPI_MIN_SIZE } from '@urganize/ui';
import {
  ChevronDown,
  Menu,
  Plus,
} from '@/components/icons';
import {
  getTaskSectionLabel,
  groupTasksIntoSections,
  type Task,
  type TaskSectionKey,
} from '@/lib/tasks';
import { sceneRowTarget } from '@/lib/nav-stall';
import { watchNavigationStall } from '@/lib/nav-stall-watch';
import type { Release } from '@/types/releases';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { TaskRow } from '@/components/tasks/TaskRow';
import { orderForThumb } from '@/lib/release-menu';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { useTaskStore } from '@/stores/useTaskStore';
import { resolvePanelBody } from '@/lib/scene-cache';
import { useSceneOverlay } from './useSceneOverlay';
import {
  useRolloutMenuActions,
  type RolloutMenuAction,
  type RolloutMenuDialogInput,
} from './useRolloutMenuActions';

// (The per-feature switches for the rollout's surfaces — Metadata, Content,
// Files, Song, Cover art, Fan capture, Timeline, Chat, Notes, Pitching — used
// to be read here, because this file built the row of pills at the top of the
// panel and the folded list on a phone. Both are one builder now:
// lib/rollout-menu.ts, drawn by useRolloutMenuActions. The desktop menu is the
// card at the top of the right-hand column (RolloutMenu); what is left in this
// file is the phone's release menu, the activity list and the search.)

// Same flag AppShell/MobileNavBar read. Below `lg` the panel shows the dock at
// the base (search and the release menu — see the 2026-08-16 mobile redesign
// note), and how far up the dock has to sit depends on which fixed surface
// already owns the screen's bottom edge — the nav bar when this is on, the
// floating UrgAns/support launcher when it isn't. Precomputed to a class so the
// dock's className stays a one-token swap, the same shape AppShell uses for
// <main>'s bottom padding. Both rules live in globals.css.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
export const TASKS_PILL_DOCK_OFFSET_CLASS = MOBILE_NAV_ENABLED
  ? 'tasks-pill-dock-nav'
  : 'tasks-pill-dock';

/**
 * The neutral (never-lit) pill treatment, exported as the one source of truth
 * for a pill beside the activity list. Its one consumer since 2026-09-30 is
 * WorkspaceDesktopFocused's "New activity" button; the row of scene pills it
 * used to style became the vertical menu in the right-hand column.
 *
 * `shrink-0 whitespace-nowrap` still matter for the reason that first put them
 * here (2026-08-10 bug fix): a flex child without them compresses and breaks its
 * own label mid-phrase instead of moving whole onto the next row, which is how
 * "Get your release recap" ended up wrapping across three lines inside a fixed
 * 32px pill.
 */
export const taskPanelPillClass =
  'motion-focus motion-press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover';

/** The labelled button at the base of the mobile dock. A word beside the icon,
 *  and 44px tall, so a thumb finds it without guessing what a bare icon does. */
const MOBILE_DOCK_TRIGGER_CLASS =
  'motion-focus motion-press inline-flex h-11 shrink-0 touch-manipulation items-center gap-2 whitespace-nowrap rounded-full border border-stroke-default bg-bg-surface px-5 text-sm font-semibold text-content-primary transition-colors hover:bg-bg-hover';

/** The panel the dock's button opens. */
const MOBILE_DOCK_PANEL_CLASS =
  'rounded-xl border border-stroke-default bg-bg-surface p-2 shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]';

/**
 * An action WorkspaceView owns and the rollout menu places — modal-shaped rather
 * than a scene toggle, so it never lights up. Structured rather than
 * pre-rendered ReactNode: the menu draws each one in a different spot at each
 * width (the right-hand column's card, or the mobile release menu), and the
 * menu needs a real label to draw — a rendered `<button>` blob can't be
 * introspected for its text.
 *
 * It carried the two flag-gated AI actions ported from the removed release
 * detail page until 2026-09-07, when both moved into the UrgAns conversation
 * on a founder call — the status update first, then the recap. What arrives
 * through it now is sharing, archiving and moving a release to another artist.
 * The shape itself is defined beside the menu hook that consumes it.
 */
export type TaskPanelAction = RolloutMenuDialogInput;

// Live work first, then the un-started pipeline by date, then the parked and
// terminal states (founder call, 2026-08-15 — status groups joined the time
// groups as peers).
//
// In Progress leads because "what is underway" was the thing with no home at
// all before this: the compact TaskRow drops the status badge, so a started
// activity was indistinguishable from an untouched one anywhere in the panel.
// Blocked and In Review follow as the other two active states. Overdue then
// leads the time groups exactly as it used to — it now holds un-started
// slippage only, since an overdue activity you've actually started shows in
// In Progress instead.
//
// Empty groups don't render (see the render loop), so a normal release shows
// a handful of these, not thirteen.
const sectionOrder: TaskSectionKey[] = [
  'in_progress',
  'blocked',
  'in_review',
  'overdue',
  'catch_up',
  'today',
  'week',
  'upcoming',
  'no_due_date',
  'backlog',
  'locked',
  'done',
  'cancelled',
];

// Default expanded state: every bucket collapsed. The header counts carry
// the signal at a glance; opening a bucket is a deliberate act, and once the
// user opens or closes one it stays that way (persisted to localStorage)
// until they change it again.
const DEFAULT_EXPANDED: Record<TaskSectionKey, boolean> = {
  in_progress: false,
  blocked: false,
  in_review: false,
  overdue: false,
  catch_up: false,
  today: false,
  week: false,
  upcoming: false,
  no_due_date: false,
  backlog: false,
  locked: false,
  done: false,
  cancelled: false,
};

// localStorage persistence for the per-bucket open/closed state. Persisted
// values are merged over DEFAULT_EXPANDED so a bucket added in a future
// version starts collapsed instead of invalidating the whole record.
const EXPANDED_STORAGE_KEY = 'urganize.workspace.task-buckets';
const EXPANDED_STORAGE_VERSION = 1;

const isPersistedExpanded = (value: unknown): value is Partial<Record<TaskSectionKey, boolean>> =>
  typeof value === 'object' &&
  value !== null &&
  Object.values(value).every((entry) => typeof entry === 'boolean');

type TasksPanelProps = {
  /** Tasks already filtered by `?release=` scope (handled in parent). */
  tasks: Task[];
  /** Scoped release context (links, empty copy); null when unscoped. */
  scopedRelease: Pick<Release, 'id' | 'title' | 'artistName'> | null;
  /** Optional DOM id, used by the parent to smooth-scroll into view when the
   * layout is stacked (below lg) and a release card is tapped. */
  id?: string;
  /**
   * The three dialog-shaped rows of the PHONE's release menu: shelve a
   * finished release (or restore an archived one), move it to another artist,
   * and share it to socials (2026-09-23). Modal-shaped, so they never light up.
   * Structured (see `TaskPanelAction`) so the menu can draw them and the mobile
   * search can match on their labels. On a desktop the same three rows are drawn
   * by the rollout menu in the right-hand column, which WorkspaceView renders
   * itself, so only the mobile mount of this panel is handed them.
   */
  archiveAction?: TaskPanelAction | null;
  changeArtistAction?: TaskPanelAction | null;
  shareAction?: TaskPanelAction | null;
  /**
   * When set, replaces the activity buckets with this content. The rollout menu
   * (the card in the right-hand column on a desktop, the hamburger on a phone)
   * is the scene switcher and it stays put across the swap — the menu is the
   * navigation, this body is what it drives.
   *
   * WorkspaceView builds this (a ReleaseScenePanel) from the `?scene=` param.
   */
  sceneContent?: ReactNode;
  /**
   * Rendered at the top of the ACTIVITIES list only — above the buckets
   * (2026-08-06, URG-230: the SetReleaseDateCard for a release with no date
   * yet).
   *
   * Deliberately inside the activities branch rather than above the body: a
   * scene (Calendar / Files / Press kit) is its own task, and a
   * date prompt hanging over it is noise. It reappears when the user comes
   * back to the activity list.
   */
  activitiesBanner?: ReactNode;
  /**
   * Rendered BELOW the main view, inside the scroll body.
   *
   * Deliberately NOT the banner slot above, which is a single slot with four
   * claimants already. A list of rows is not a banner and should not fight one
   * for the space; and it scrolls with the content rather than taking pinned
   * height from it.
   *
   * Gated on `bodyIsMainView`, not on the buckets branch: since 2026-09-06 the
   * main view can be the timeline, and a footer left inside the buckets would
   * be invisible in what is now the default state.
   */
  activitiesFooter?: ReactNode;
  /**
   * Set when `activitiesBanner` already explains the empty list AND offers a
   * way to act on it — the plan-waiting SetReleaseDateCard does both, so the
   * generic empty state below would just repeat it (URG-233).
   *
   * NOT inferred from `activitiesBanner` being present: the compact date row
   * explains nothing about the activity list, so an empty view under it still
   * needs its own empty state. Inferring would leave that case blank.
   */
  bannerReplacesEmptyState?: boolean;
};

/** One entry in the mobile release menu. Since 2026-08-31 that is EVERY
 * release surface on a phone, not just the folded overflow — the top-tabs
 * strip is gone and this list replaced it (founder call, below).
 *
 * Data, not JSX, for two reasons: the mobile SEARCH surface matches these on
 * `label`, which a pre-rendered button can't be introspected for; and
 * `lib/release-menu.ts` sorts them, which needs a `key` it can read.
 *
 * The shape and the builder moved to useRolloutMenuActions on 2026-09-30, when
 * the desktop menu (the card in the right-hand column) started drawing the same
 * rows. `key` is still the closed `ReleaseMenuKey` union: a new entry that
 * hasn't been given a position in RELEASE_MENU_ORDER fails to type-check, which
 * is what stops the next scene silently landing at the bottom. */
type MoreMenuAction = RolloutMenuAction;

export function TasksPanel({
  tasks,
  scopedRelease,
  id,
  archiveAction,
  changeArtistAction,
  shareAction,
  sceneContent,
  activitiesBanner,
  activitiesFooter,
  bannerReplacesEmptyState = false,
}: TasksPanelProps) {
  // openTask opens the global task detail pop-up mounted by TaskUIProvider —
  // this panel stays where it is underneath the modal.
  const { openTask, openQuickCreate } = useTaskUI();

  // The rollout menu's rows swap this panel's body between the main view and a
  // release scene (Calendar / Files / Song / …), in place — they were nav links
  // to separate pages until 2026-08-04, then briefly modal overlays, and are an
  // inline swap per the founder's correction. Pressing the row of the scene
  // that's already open closes it. This panel only needs to know WHICH body is
  // showing; opening and closing is the menu hook's job.
  const { activeScene: urlScene } = useSceneOverlay();

  /**
   * Whether the panel body is the release's MAIN VIEW — the timeline, or the
   * activity buckets when the timeline flag is off — rather than one of the
   * named scenes.
   *
   * This exists for one reason: the standing banners below belong to the main
   * view, not to the bucket list specifically. Until 2026-09-06 those were the
   * same thing, so `activitiesBanner` lived inside the buckets branch — and
   * leaving it there would have silently dropped SetReleaseDateCard,
   * PlanReleaseCard and TestReleaseBanner the moment the timeline became what a
   * release lands on. Each of those is the ONLY path to the thing it offers,
   * and the timeline's own empty states are text with no button, so a dateless
   * release would have read "Set a release date first" with nothing to tap.
   */
  const bodyIsMainView = (() => {
    const body = resolvePanelBody(urlScene);
    return body === 'activities' || body === 'timeline';
  })();

  // The ?priority= / ?status= filter dropdowns were removed entirely
  // (founder call, 2026-07-23) — the bucket structure IS the filter now.
  // Restore from git history if per-panel filtering ever returns.

  // Pending-completion override: just-ticked tasks keep their original
  // time-based bucket for ~1.5s before sliding into Done. The store owns
  // the timer; the panel just reads the override so render output matches
  // the in-place beat.
  const pendingCompletionIds = useTaskStore((state) => state.pendingCompletionIds);

  const sections = useMemo(
    () => groupTasksIntoSections(tasks, pendingCompletionIds),
    [tasks, pendingCompletionIds]
  );

  // Denominator for every group's share bar. Read from `tasks` rather than by
  // summing the grouped sections: each task lands in exactly one group, so the
  // two agree, and this can't drift if a group is ever added.
  const totalTaskCount = tasks.length;

  // Per-bucket open/closed state. Starts from the all-collapsed defaults so
  // the server-rendered HTML matches, then hydrates from localStorage on
  // mount (same pattern as the notifications prefs in app/settings/page.tsx).
  // After that the state only changes when the user toggles a header.
  const [expanded, setExpanded] = useState<Record<TaskSectionKey, boolean>>(DEFAULT_EXPANDED);

  useEffect(() => {
    const persisted = readPersistedState(
      EXPANDED_STORAGE_KEY,
      EXPANDED_STORAGE_VERSION,
      isPersistedExpanded
    );
    if (persisted) {
      setExpanded({ ...DEFAULT_EXPANDED, ...persisted });
    }
  }, []);

  // No auto-expand on scope changes: bucket state is user-owned. Scoping a
  // release updates the header counts; which buckets are open stays exactly
  // as the user last left it.
  const toggleBucket = (key: TaskSectionKey) => {
    const next = { ...expanded, [key]: !expanded[key] };
    setExpanded(next);
    writePersistedState(EXPANDED_STORAGE_KEY, EXPANDED_STORAGE_VERSION, next);
  };

  // The mobile dock's two panels (2026-08-16 redesign, split 2026-08-31 —
  // see the base-dock block below). Both collapsed by default, so neither is
  // reserved in the skeleton beyond its trigger button (data this component
  // doesn't have yet gets no guessed width).
  //
  // ONE selector rather than two booleans, so the panels are mutually
  // exclusive by construction: they occupy the same slot above the trigger
  // row, and two open at once would stack into a full-screen sheet nobody
  // designed.
  const [openMobilePanel, setOpenMobilePanel] = useState<'menu' | null>(null);
  const moreMenuListId = useId();

  const toggleMobilePanel = (panel: 'menu') => {
    setOpenMobilePanel((current) => (current === panel ? null : panel));
  };

  /**
   * The mobile release menu — EVERY release surface on a phone since
   * 2026-08-31, not just the overflow it used to be.
   *
   * Founder call that day: "Remove all top menu pills in mobile view and put
   * them in the hamburger menu. In an order that makes sense to the user based
   * on previous usage data." So the top-tabs strip (Timeline / Content /
   * Metadata / Pitch, permanent tabs since 2026-08-16) is gone and those four
   * are entries here, ranked among the rest.
   *
   * Nothing was stranded by removing that strip, which is the check worth
   * repeating before touching this: every scene renders inside
   * `ReleaseScenePanel`, which carries its own heading naming the scene AND
   * its own "Activities" back control at every width. So the tabs were not the
   * way out of a scene and not the only label saying which one was open —
   * losing them costs the ability to switch scene A → scene B in one tap,
   * which now takes two (open the menu, pick).
   *
   * WHAT IS IN IT, AND IN WHAT ORDER, is lib/rollout-menu.ts and
   * lib/release-menu.ts, the second of which carries the full argument for the
   * order — including the honest note that there is no usage data to base it on.
   * Since 2026-09-30 the desktop's menu, the card at the top of the right-hand
   * column, is drawn from the same builder, and the only difference between the
   * two is the `phone` variant here, which turns the Notes row into "Note this"
   * and asks for a blank note straight away.
   *
   * Data, not JSX, so the search surface below can match on a real label.
   */
  const moreMenuActions = useRolloutMenuActions({
    releaseId: scopedRelease?.id ?? null,
    variant: 'phone',
    share: shareAction,
    changeArtist: changeArtistAction,
    archive: archiveAction,
  });

  // The dock renders only when the menu has actions to list. Search is not here
  // any more (2026-10-04): the top bar's search is the one search, and it finds
  // this rollout's activities first when a rollout is open.
  const hasMobileDockControls = moreMenuActions.length > 0;

  const closeMobilePanels = () => {
    setOpenMobilePanel(null);
  };

  const handleMoreMenuSelect = (action: MoreMenuAction) => {
    // Scene toggles change the address; dialog rows leave isActive undefined.
    // Same rule as the desktop RolloutMenu, so both surfaces report alike.
    if (action.isActive !== undefined) {
      watchNavigationStall(
        `rollout_menu:${action.key}`,
        sceneRowTarget(window.location.href, action.key, Boolean(action.isActive))
      );
    }
    action.onClick();
    closeMobilePanels();
  };

  return (
    // `min-w-0` here is defensive: the panel is rendered both inside the
    // desktop two-pane grid (where the grid item carries min-w-0) AND as a
    // full-screen mobile drill-down. min-w-0 on the aside itself means the
    // panel's "shrink to fit container" contract holds regardless of how
    // the surrounding layout was wired. `flex-1` only takes effect on desktop,
    // where this is a direct grid child that stretches to fill its row track
    // (see WorkspaceDesktopFocused) — on mobile, where it's an ordinary block
    // child in normal page flow, `flex: 1 1 0%` on a non-flex-item is inert.
    // Below lg the panel is at least a screen tall (minus the chrome above it),
    // so the sticky mobile dock at its end lands at the bottom of the screen
    // even when the content is short (an empty chat, a thin scene). Without a
    // floor, `sticky` has nothing to stick against and the dock sat mid-page
    // right under the content. `mt-auto` on the dock pushes it to the end.
    <aside id={id} data-tour="activities" className="flex min-h-[calc(100dvh-9rem)] min-w-0 flex-1 flex-col scroll-mt-20 lg:min-h-0">
      {/* (The desktop's row of scene pills that sat here until 2026-09-30 is
          the rollout menu now: a vertical card at the top of the right-hand
          column, above the UrgAns chat, rendered by WorkspaceView and drawn from
          the same builder as the phone's release menu below. "New activity" moved
          up beside the Motion bar. Founder call, from Cursor's agent window.) */}

      {/* The mobile top-tabs strip that used to sit here — Timeline / Content
          / Metadata / Pitch, a Vercel-style tab bar from 2026-08-16 — was
          REMOVED 2026-08-31 (founder call: "Remove all top menu pills in
          mobile view and put them in the hamburger menu"). Those four are
          entries in the release menu at the base of the panel now, ranked
          among the rest by lib/release-menu.ts.

          Recorded because the strip's own history is a run of corrections and
          the next instinct may be to bring it back: it never fit. Four tabs
          needed roughly 356px against the ~343px a 375px phone offers, so it
          scrolled horizontally, which means it was never the "every tab
          visible at once" bar it was modelled on — the fourth was always off
          the side. What replaced it costs one extra tap to switch scenes and
          gives the width back to the activity list.

          Nothing became unreachable. Every scene renders inside
          ReleaseScenePanel, which brings its own heading naming the scene and
          its own "Activities" back control at every width, so the tabs were
          neither the way out of a scene nor the only thing saying which one
          was open. (On a desktop the same rows are the card at the top of the
          right-hand column.) */}

      {/* Scrollable body — desktop-only internal scroll box (`lg:` prefix).
          On desktop this box gets a real bounded height from the ancestor
          chain (WorkspaceDesktopFocused's viewport-locked column), so it's
          the ONLY thing that scrolls there and its native scrollbar (the
          `pr-1` inset, also `lg:`-only) is confined to this box and never
          runs past the static header above.

          On mobile it must stay a plain block, NOT a scroll container.
          `overflow-y-auto` makes a div a scroll target for touch purposes
          even with no height bound to actually fill, and pairing that with
          `overscroll-contain` blocks the swipe from ever chaining up to the
          page — a swipe starting on a task row died right there instead of
          scrolling. (An earlier version of this comment claimed
          `overflow-y-auto` "never actually triggers" on mobile; it does
          trigger scroll-container status, just not an internal scrollbar,
          and that was enough to trap the gesture — this was the reported
          bug.) Below `lg` this is unclassed flow content, so touches on
          task rows scroll the page natively, same as anywhere else on the
          page.

          A release scene takes this slot when one is open, otherwise the
          activity buckets do; the pills stay put either way — the desktop
          header row above, the mobile rows above and below — so the scene
          switcher never disappears (founder call, 2026-08-05). */}
      <div className="flex min-h-0 flex-1 flex-col pb-4 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
      {/* Above the body rather than inside the buckets, so it survives the
          timeline taking the main view — see `bodyIsMainView`. Deliberately
          NOT shown over the named scenes: a "Plan the rollout" card on top of
          the Metadata scene is noise, and that is the behaviour this keeps. */}
      {bodyIsMainView && activitiesBanner ? (
        <div className="mb-3">{activitiesBanner}</div>
      ) : null}
      {sceneContent ? (
        sceneContent
      ) : (
      <div className="space-y-3">
        {/* Every bucket empty: the buckets below have all suppressed
            themselves, so this stands in for the whole list.
            Actionable rather than a muted line (URG-233) — an empty panel
            whose only affordance is a small pill elsewhere reads as
            "nothing to do here" instead of "start here". Skipped when the
            banner already covers both jobs. */}
        {!bannerReplacesEmptyState &&
        sectionOrder.every((sectionKey) => sections[sectionKey].length === 0) ? (
          <div className="px-1 py-6 text-center">
            {/* The mascot only joins the SCOPED wording, and that is the
                guard rather than a style choice: with no releases at all the
                releases column is empty too and already shows him, so
                pairing him with "No activities yet." would put two on one
                screen. No release scoped means no release list beside this
                one that could be full. */}
            {scopedRelease ? (
              <div className="mb-3 flex justify-center">
                <Chappi pose="resting" size={CHAPPI_MIN_SIZE} />
              </div>
            ) : null}
            <p className="text-sm text-content-secondary">
              {scopedRelease ? 'No activities for this rollout yet.' : 'No activities yet.'}
            </p>
            <button
              type="button"
              onClick={() =>
                openQuickCreate({ releaseId: scopedRelease?.id || undefined, source: 'inline' })
              }
              className="motion-focus motion-press mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-stroke-default bg-bg-surface px-3.5 text-sm font-medium text-content-primary transition-colors hover:border-stroke-strong hover:bg-bg-hover"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add your first activity
            </button>
          </div>
        ) : null}
        {sectionOrder.map((sectionKey) => {
          const sectionTasks = sections[sectionKey];
          const isOpen = expanded[sectionKey];
          const isDoneBucket = sectionKey === 'done';
          // Empty buckets don't render at all (founder call, 2026-07-23,
          // restored 2026-08-15 after a brief spell where the five time
          // buckets rendered empty): a bucket appears the moment a task moves
          // into it and disappears when its last task leaves. With thirteen
          // possible groups this matters more than it did with seven.
          // The all-empty case gets a single quiet line below the list.
          if (sectionTasks.length === 0) return null;
          const bodyId = `workspace-bucket-${sectionKey}`;
          // The bar shows this group's SHARE OF THE RELEASE — how much of the
          // whole sits in this state (founder call, 2026-08-15). Under
          // status-first grouping a "how much of this group is started"
          // metric would read 100% on every status group and 0% on every time
          // group, carrying no information; share is meaningful for all
          // thirteen. The In Progress bar is then literally "how much of this
          // release is underway", which is what was asked for.
          const sharePercent =
            totalTaskCount > 0
              ? Math.round((sectionTasks.length / totalTaskCount) * 100)
              : 0;
          // Label + bar, hoisted so the row markup stays readable.
          const headerInner = (
            <>
              <span
                className={`text-sm font-semibold ${
                  sectionKey === 'overdue'
                    ? 'text-status-error'
                    : isDoneBucket || sectionKey === 'cancelled'
                      ? 'text-content-secondary'
                      : 'text-content-primary'
                }`}
              >
                {getTaskSectionLabel(sectionKey)}
                <span className="ml-2 font-normal text-content-tertiary">
                  ({sectionTasks.length})
                </span>
              </span>
              {/* Share-of-release bar (the Motion bar pattern:
                  bg-stroke-strong track, never bg-bg-elevated — see
                  WorkspaceView's tracker). aria-hidden like every Motion bar;
                  the count above stays the accessible metric. */}
              <div className="h-1.5 min-w-0 flex-1 rounded-full bg-stroke-strong" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-300"
                  style={{ width: `${sharePercent}%` }}
                />
              </div>
            </>
          );
          return (
            <div
              key={sectionKey}
              className={`overflow-hidden rounded-xl border border-stroke-default ${
                isDoneBucket || sectionKey === 'cancelled' ? 'bg-bg-surface/60' : 'bg-bg-surface'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleBucket(sectionKey)}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                className={`motion-focus flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover ${
                  isOpen ? 'border-b border-stroke-subtle' : ''
                }`}
              >
                {headerInner}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-content-tertiary transition-transform ${
                    isOpen ? '' : '-rotate-90'
                  }`}
                  aria-hidden="true"
                />
              </button>
              {isOpen ? (
                <div id={bodyId}>
                  {sectionTasks.map((task) => {
                    const isLeaving = Boolean(pendingCompletionIds[task.id]);
                    return (
                      <div
                        key={task.id}
                        className={isLeaving ? 'task-row-pending-completion' : ''}
                      >
                        <TaskRow
                          task={task}
                          density="compact"
                          onClick={(t) => openTask(t.id)}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      )}

      {/* The role gaps panel, below whichever MAIN VIEW rendered.
          `bodyIsMainView` and not the buckets branch, for exactly the reason
          the banner above carries: the timeline became what a release lands
          on (2026-09-06), so a footer left inside the buckets would have gone
          dark the moment that flag went on — invisible in the one state that
          is now the default. It belongs to the main view, not to the list. */}
      {bodyIsMainView && activitiesFooter ? (
        <div className="mt-3">{activitiesFooter}</div>
      ) : null}
      </div>

      {/* (The desktop footer row that held Content and Fan capture, hidden the
          moment any scene opened, is gone with the pills above: both are rows
          in the rollout menu now and stay there whichever scene is open.) */}

      {/* Mobile base dock (below `lg` ONLY) — redesigned 2026-08-16 (founder
          request, screenshot reference) from "every pill in one wrapping
          block" into a folded "more" menu, holding everything else this panel
          used to put in the old dock: Cover art, Song, Files, Status update,
          Recap, Press kit, Fan capture.

          SPLIT 2026-08-31 (founder request, screenshot reference): the two
          icon buttons used to open the SAME panel, which carried a search box
          above the menu list — so "search" only ever filtered those eight
          labels and could not find an activity, the thing a release actually
          has sixty of. Now they are two surfaces:

            hamburger -> the menu, and only the menu. No field in it at all.
            search    -> a field over real results, in three groups: matching
                         activities, then any release tool whose name matches,
                         then the app's own pages (Catalog, UrgAns, Notes,
                         Shows, Settings, the curator crossing — see
                         lib/app-pages.ts, which carries the keywords that make
                         "billing" find Settings).

          Both live in the same slot above the trigger row and are mutually
          exclusive (see `openMobilePanel`). The panel sits at the BOTTOM of
          the screen rather than the top as in the reference screenshot: the
          dock is thumb-reachable, and moving a phone's primary control to the
          top corner is the exact thing NEXT_PUBLIC_FEATURE_MOBILE_NAV exists
          to undo.

          THE MENU IS EVERYTHING NOW (2026-08-31, founder call): "Remove all
          top menu pills in mobile view and put them in the hamburger menu."
          Timeline, Content, Pitch and Metadata were permanent top tabs from
          2026-08-16 and are ranked entries in this list instead. It is no
          longer an overflow, which is why the trigger's label reads "Release
          menu" and the open scene's row lights up — that lit state is what
          the tabs used to carry.

          The row also used to have two permanent standalone pills — New
          activity/Activities and Pitch — both removed 2026-08-17: Pitch went
          up into the top-tabs strip (and has now landed back here, one layer
          down), and New activity was retired outright, since the center "+"
          in `MobileNavBar` opens Quick Create directly when a release is
          scoped. Losing "Activities" (that button's back-from-a-scene state)
          costs nothing: every scene brings its own "Activities" back control
          inside `ReleaseScenePanel`, and every menu entry is a toggle, so
          re-tapping a lit row closes it too.

          `sticky` (not `fixed`) for the same reason the old dock used it:
          this is the last child in flow, so a short list leaves it sitting
          under the content rather than covering it, with no compensating
          spacer padding needed.

          No border/background of its own (founder call, 2026-08-17,
          correcting the first pass): the row used to carry a top border
          plus `bg-bg-base`, which read as a boxed rectangle sitting under
          the pills rather than the pills just floating on the page — the
          same borderless, backgroundless treatment the top tabs row above
          already uses.

          The bottom offset still clears whichever fixed surface already
          owns the screen's edge — see TASKS_PILL_DOCK_OFFSET_CLASS. The
          -mx/px bleed still matches <main>'s own gutter at each breakpoint. */}
      <div
        className={`sticky z-20 -mx-4 mt-auto flex flex-col gap-2 px-4 pb-3 pt-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:hidden ${TASKS_PILL_DOCK_OFFSET_CLASS}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* CENTRED, not pinned to the right edge (founder call,
              2026-09-05). This row sits directly above MobileNavBar's centred
              "+", so a right-aligned pair read as an afterthought tucked into
              a corner rather than as the panel's own controls. Centred, the
              pair's midpoint lines up with that button, and on a release with
              no activities — where the search trigger does not render at all —
              the hamburger lands dead centre under it.

              `mx-auto` on the GROUP rather than `justify-center` on the row:
              it keeps the intent with the thing being centred, so the row
              stays a plain flex container if it ever holds something else. */}
          {hasMobileDockControls ? (
            <div className="mx-auto flex shrink-0 items-center gap-2">
              {/* touch-manipulation on both: disables the browser's own
                  double-tap-to-zoom gesture on these specific buttons
                  (independent of the search field's font-size fix below —
                  this guards against the tap itself zooming the page, not
                  just a focused field zooming it), while leaving pinch-zoom
                  available everywhere else for accessibility. */}
              {moreMenuActions.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleMobilePanel('menu')}
                  aria-expanded={openMobilePanel === 'menu'}
                  aria-controls={moreMenuListId}
                  // "More" was right while this was an overflow list. Since
                  // 2026-08-31 it holds every release surface, so it is the
                  // release menu and says so.
                  data-tour="rollout-menu"
                  className={MOBILE_DOCK_TRIGGER_CLASS}
                >
                  <Menu className="h-4 w-4" aria-hidden="true" />
                  Rollout menu
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* The menu: the plain list, no field. Since 2026-08-31 this is every
            release surface on a phone, not an overflow — see
            `moreMenuActions` above, and lib/release-menu.ts for the order.

            `50dvh` rather than the old fixed `max-h-60` (240px, about five
            rows): the list is up to fourteen entries now, and the top of it is
            where the most-used surfaces sit, so the cap decides how much of
            the ranking a user sees without scrolling. `dvh` and not `vh`
            deliberately — on a phone `vh` is the LARGE viewport, so with
            browser chrome showing a `vh` cap overshoots the space actually on
            screen (the same unit that had the UrgAns composer drifting for
            eight PRs). */}
        {openMobilePanel === 'menu' ? (
          <div id={moreMenuListId} className={MOBILE_DOCK_PANEL_CLASS}>
            <ul className="max-h-[50dvh] overflow-y-auto">
              {orderForThumb(moreMenuActions).map((action) => (
                <li key={action.key}>
                  <button
                    type="button"
                    onClick={() => handleMoreMenuSelect(action)}
                    disabled={action.disabled}
                    // Undefined on the modal actions, which omits the
                    // attribute entirely rather than announcing them as
                    // unpressed toggles.
                    aria-pressed={action.isActive}
                    className={`motion-focus flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors disabled:opacity-60 ${
                      action.isActive
                        ? 'bg-brand/10 font-semibold text-content-primary'
                        : 'text-content-primary hover:bg-bg-hover'
                    }`}
                  >
                    <action.icon
                      className={`h-4 w-4 shrink-0 ${
                        action.isActive ? 'text-brand' : 'text-content-tertiary'
                      }`}
                      aria-hidden="true"
                    />
                    {action.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
