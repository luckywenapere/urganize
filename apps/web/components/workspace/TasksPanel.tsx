'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronDown, ClipboardList, FolderOpen, ListChecks, Mail, Newspaper, NotebookPen, Plus, Radio, Sparkles } from 'lucide-react';
import {
  getTaskSectionLabel,
  groupTasksIntoSections,
  type Task,
  type TaskSectionKey,
} from '@/lib/tasks';
import type { Release } from '@/types/releases';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { useTaskStore } from '@/stores/useTaskStore';
import { useSceneOverlay, type SceneName } from './useSceneOverlay';

// Metadata entry point (URG-108). This flag also gates the identity panel's
// "Collect metadata" nav item (WorkspaceIdentityPanel) — the two must never
// disagree about whether the feature exists, only about WHICH surface shows
// it at a given viewport.
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';

// Mirrors AppShell's own gate for the identity card, which is what hosts the
// "Collect metadata" nav item this pill defers to at wide widths. Read here
// because the pill may only step aside where that card actually renders —
// both flags default to false and are independent of METADATA above, so
// without this check a metadata-on / identity-panel-off environment (the
// DEFAULT combination) would hide the pill at `lg`+ with nothing replacing
// it, making Metadata unreachable on desktop entirely.
const IDENTITY_PANEL_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// The identity card hides itself at `lg`-`xl` whenever the UrgAns rail is open
// (see WorkspaceIdentityPanel's railIsCompeting), so with the assistant on
// there is no width below `xl` where the card is GUARANTEED to be present.
// Rather than duplicate that runtime rail state here — the kind of mirrored
// condition that silently drifts — the pill retreats one breakpoint later
// when Chappi is on. Cost: a redundant second control at `lg`-`xl` while the
// rail happens to be closed. That is strictly better than a viewport band
// where the feature has no entry point at all.
// Exported so WorkspaceSkeleton reserves the placeholder at exactly the same
// breakpoints (the loading-skeleton-sync rule that file documents; it has
// already drifted from this row once).
export const METADATA_PILL_HIDE_CLASS = !IDENTITY_PANEL_ENABLED
  ? ''
  : process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true'
    ? 'xl:hidden'
    : 'lg:hidden';

// Content calendar entry point (URG-157): the workspace is the surface users
// actually land on after login, so the scoped-release header carries the
// calendar affordance alongside Files rather than hiding it on the release
// detail page alone. As of 2026-08-13 (founder correction, via screenshot)
// the pill moved OUT of the header row into its own footer row below the
// activity list, and as of 2026-08-14 that footer row is desktop-only — below
// `lg` the pill is part of the single bottom dock. This flag gates the pill
// itself (`outboundPills`), wherever it happens to render.
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';

// Files entry point (URG-182): same flag gates the assets API routes and the
// release detail page's Asset section.
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';

// Press kit entry point (URG-198): the EPK shipped (URG-196) reachable only
// from the release detail page's side menu — invisible from the workspace
// users actually land on. Same flag that gates the EPK page and API routes.
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

// Fan capture entry point (2026-08-14): the third "thing you send outward",
// so it joins Calendar and Press kit in the panel footer rather than the
// header pill row — the same founder reasoning that moved Press kit there.
const CAPTURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true';

// Notes entry point: same flag AppTopbar and the identity panel read.
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

// Playlist pitching entry point: same flag gates the curator surface, the
// /api/pitching routes and the /api/curator routes.
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

// Same flag AppShell/MobileNavBar read. Below `lg` every pill collects into
// one sticky dock at the base of this panel (see the dock block at the bottom
// of the render), and how far up that dock has to sit depends on which fixed
// surface already owns the screen's bottom edge — the nav bar when this is on,
// the floating UrgAns/support launcher when it isn't. Precomputed to a class
// so the dock's className stays a one-token swap, the same shape AppShell uses
// for <main>'s bottom padding. Both rules live in globals.css.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
export const TASKS_PILL_DOCK_OFFSET_CLASS = MOBILE_NAV_ENABLED
  ? 'tasks-pill-dock-nav'
  : 'tasks-pill-dock';

/**
 * The scene-pill row's neutral (never-lit) pill treatment — hoisted to
 * module scope and exported as the one source of truth. WorkspaceView's
 * `extraActions` pills (Status update / Release recap) used to hand-roll a
 * byte-for-byte copy of this string; that copy had already drifted (missing
 * `shrink-0 whitespace-nowrap`) by the time this row grew to 9 pills on
 * mobile, which is how "Get your release recap" ended up wrapping across
 * three lines inside a fixed 32px pill (2026-08-10 bug fix). `shrink-0
 * whitespace-nowrap` still matter, for the same reason in a new container:
 * below `lg` the pills wrap inside the bottom dock, and a flex child without
 * them compresses and breaks its own label mid-phrase instead of moving whole
 * onto the next row.
 */
export const taskPanelPillClass =
  'motion-focus motion-press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover';

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
  /** Extra pills appended to the header row after the nav links — the
   * flag-gated AI actions (Tailor plan / Generate status update) that used
   * to live only on the now-removed release detail page (2026-08-04). Kept
   * as a slot rather than owned here so this component stays presentational;
   * WorkspaceView owns the modals/state. */
  extraActions?: ReactNode;
  /**
   * When set, replaces the activity buckets with this content while keeping the
   * header row of pills above it (2026-08-05, founder call). That row is the
   * scene switcher, so it has to survive the swap — the pills are the
   * navigation, the body is what they drive.
   *
   * WorkspaceView builds this (a ReleaseScenePanel) from the `?scene=` param.
   */
  sceneContent?: ReactNode;
  /**
   * Rendered at the top of the ACTIVITIES list only — above the buckets,
   * below the header pills (2026-08-06, URG-230: the SetReleaseDateCard for a
   * release with no date yet).
   *
   * Deliberately inside the activities branch rather than above the body: a
   * scene (Calendar / Files / Press kit) is its own task, and a
   * date prompt hanging over it is noise. It reappears when the user comes
   * back to the activity list.
   */
  activitiesBanner?: ReactNode;
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
  /**
   * Show the Plan pill. Owned by WorkspaceView because the answer depends on
   * whether a draft exists, which only it knows — this component stays
   * presentational.
   */
  showPlanPill?: boolean;
};

export function TasksPanel({
  tasks,
  scopedRelease,
  id,
  extraActions,
  sceneContent,
  activitiesBanner,
  bannerReplacesEmptyState = false,
  showPlanPill = false,
}: TasksPanelProps) {
  // openTask opens the global task detail pop-up mounted by TaskUIProvider —
  // this panel stays where it is underneath the modal.
  const { openTask, openQuickCreate } = useTaskUI();

  // The pills below swap this panel's body between the activity buckets and a
  // release scene (Calendar / Files / Press kit), in place — they
  // were nav links to separate pages until 2026-08-04, then briefly modal
  // overlays, and are now an inline swap per the founder's correction. Clicking
  // the pill of the scene that's already open closes it, back to activities.
  const { activeScene: urlScene, openScene, closeScene } = useSceneOverlay();
  // Mirror WorkspaceView's flag gate: with the calendar flag off, a stale
  // `?scene=calendar` URL must not flip the leading pill to "Activities" for a
  // scene that isn't rendering (WorkspaceView passes no sceneContent then).
  // Same for `?scene=capture` behind its own flag.
  const activeScene =
    (urlScene === 'calendar' && !CONTENT_CALENDAR_ENABLED) ||
    (urlScene === 'capture' && !CAPTURE_ENABLED)
      ? null
      : urlScene;

  /**
   * Pill classes, lit when that scene is the open one. `shrink-0
   * whitespace-nowrap` (2026-08-10 bug fix): the pills wrap inside the mobile
   * dock below `lg`, and without these a flex child is free to compress and
   * break its own label mid-phrase rather than moving whole onto the next row
   * — which is exactly how "Get your release recap" used to spill across three
   * lines inside a fixed 32px pill.
   */
  const pillClass = (scene: SceneName) =>
    `motion-focus motion-press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors ${
      activeScene === scene
        ? 'border-brand bg-brand/10 text-content-primary'
        : 'border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
    }`;

  // Shared with the New activity / Activities toggle below — same neutral
  // (never-lit) treatment regardless of which of the two states it's in.
  // Hoisted to module scope as the exported `taskPanelPillClass` (above the
  // component) so WorkspaceView's extraActions pills use the real thing
  // instead of a hand-rolled copy.
  const neutralPillClass = taskPanelPillClass;

  /** Open the scene, or close it if it's the one already showing. */
  const toggleScene = (scene: SceneName, releaseId: string) => {
    if (activeScene === scene) {
      closeScene();
      return;
    }
    openScene(scene, releaseId);
  };

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

  /**
   * The pills both layouts share, built ONCE and rendered into two
   * containers: the desktop header row (lg+) and the mobile dock at the
   * panel's base (below lg). Exactly one container is displayed at any width —
   * the other carries `hidden` / `lg:hidden`, and `display: none` takes it out
   * of the accessibility tree and the tab order entirely — so a user (or a
   * screen reader) never meets the same control twice. The duplication is in
   * the DOM only, and it's what lets the mobile dock wrap ALL the pills into
   * one continuous run of rows: two separate containers would wrap
   * independently and leave a ragged seam between them.
   *
   * `notesPill` (desktop only) and `extraActions` are rendered by each
   * container instead of living in here, so the desktop row keeps its Files →
   * Notes → AI actions order while the dock simply never receives Notes.
   */
  const primaryPills = (
    <>
      {/* Toggles with the scene body below: "New activity" opens Quick
          Create while the activity list is showing; once a scene (Calendar
          / Files / Press kit) has taken this slot, the SAME
          button position becomes "Activities" so there's always a way
          back without hunting for the scene's own pill again. */}
      {activeScene ? (
        <button type="button" onClick={closeScene} className={neutralPillClass}>
          <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
          Activities
        </button>
      ) : (
        <button
          type="button"
          onClick={() =>
            openQuickCreate({
              releaseId: scopedRelease?.id || undefined,
              source: 'inline',
            })
          }
          className={neutralPillClass}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New activity
        </button>
      )}
      {/* Plan pill, first while it exists. A release with no activities
          has exactly one job, and this is it; once a plan is approved the
          pill disappears, because from then on the activity list IS the
          plan. Only shown while there is something to open (no activities
          yet, or a draft already waiting) so it never becomes permanent
          chrome. */}
      {showPlanPill && scopedRelease ? (
        <button
          type="button"
          onClick={() => toggleScene('plan', scopedRelease.id)}
          aria-pressed={activeScene === 'plan'}
          className={pillClass('plan')}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Plan
        </button>
      ) : null}
      {/* Metadata link (URG-108) — NARROW widths only as of 2026-08-12,
          since the identity panel's "Collect metadata" nav item is now
          this release's persistent entry point (see
          WorkspaceIdentityPanel) and two controls for one scene is noise.
          But that panel never renders on small viewports, so the pill has
          to survive there: the mobile dock is the only surface present at
          every width. See METADATA_PILL_HIDE_CLASS for exactly where it
          retreats — it stays put entirely when the panel is flagged off.
          (Inside the mobile dock that class is inert, since the dock is
          already `lg:hidden`; it does its work in the desktop header row.) */}
      {METADATA_ENABLED && scopedRelease ? (
        <button
          type="button"
          onClick={() => toggleScene('metadata', scopedRelease.id)}
          aria-pressed={activeScene === 'metadata'}
          className={`${pillClass('metadata')} ${METADATA_PILL_HIDE_CLASS}`}
        >
          <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
          Collect metadata
        </button>
      ) : null}
      {/* Playlist pitching: browse curator playlists and send this
          release's song, with each curator's answer shown beside it.
          Sits high in the row (founder call, 2026-08-10) — right after
          Collect metadata. Note that pill retreats at wide widths (see
          METADATA_PILL_HIDE_CLASS), so this is effectively the first
          link in the desktop row there. */}
      {PITCHING_ENABLED && scopedRelease ? (
        <button
          type="button"
          onClick={() => toggleScene('pitch', scopedRelease.id)}
          aria-pressed={activeScene === 'pitch'}
          className={pillClass('pitch')}
        >
          <Radio className="h-3.5 w-3.5" aria-hidden="true" />
          Pitch
        </button>
      ) : null}
      {/* Files link: its own scene (URG-165), not a segment nested under
          the task list — files are a peer of tasks, not a child of them.
          Only renders when a release is scoped (assets is release-scoped,
          see /api/releases/{id}/assets). */}
      {FILES_ENABLED && scopedRelease ? (
        <button
          type="button"
          onClick={() => toggleScene('files', scopedRelease.id)}
          aria-pressed={activeScene === 'files'}
          className={pillClass('files')}
        >
          <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Files
        </button>
      ) : null}
    </>
  );

  /**
   * Notes for this release — DESKTOP ONLY (founder call, 2026-08-15: notes
   * should not be one of the mobile pills), which is why it is its own
   * variable rather than part of `primaryPills` above: it is rendered into the
   * desktop header row and simply never handed to the mobile dock. Kept as a
   * placement decision in JSX rather than a `hidden lg:inline-flex` class,
   * which would rest on Tailwind's internal ordering of two competing base
   * `display` utilities.
   *
   * Nothing becomes unreachable: below `lg` Notes has its own tab in
   * `MobileNavBar`, and with that bar flagged off `AppTopbar` renders its nav
   * icons (Notes among them) at every width instead — so the surface has an
   * entry point on a phone in either flag state. What the phone loses is the
   * `?release=` PRE-FILTER those two entry points don't carry; filtering to
   * this release is then a tap inside the notes page rather than on the way in.
   *
   * Deliberately a plain LINK, not a scene toggle like its neighbours: notes
   * are a global surface that happens to filter by release, not a per-release
   * panel body — so this navigates to the notes page pre-filtered rather than
   * swapping this panel's contents. (Not a regression of the 2026-08-05
   * "scenes render inline, not as pages" call: that call was about the four
   * release scenes, which stay inline.)
   */
  const notesPill =
    NOTES_ENABLED && scopedRelease ? (
      <Link href={`/dashboard/notes?release=${scopedRelease.id}`} className={neutralPillClass}>
        <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
        Notes
      </Link>
    ) : null;

  /**
   * Calendar, Press kit and Fan capture — the things you send outward, which
   * is why they sit together (Press kit joined Calendar 2026-08-14, founder
   * call; Fan capture joined them the same day). On desktop they stay a footer
   * row pinned to the panel's base; on mobile they're simply the tail of the
   * one dock.
   *
   * Defined ONCE and rendered into both containers, so a pill can never exist
   * at one width and not the other — the failure mode CLAUDE.md records
   * Metadata and the curator crossing each hitting.
   */
  const outboundPills = (
    <>
      {CONTENT_CALENDAR_ENABLED ? (
        <button
          type="button"
          onClick={() => scopedRelease && toggleScene('calendar', scopedRelease.id)}
          aria-pressed={activeScene === 'calendar'}
          className={pillClass('calendar')}
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          Calendar
          {/* No Beta stamp (founder call, 2026-08-15 — dropped completely, so
              the scene's own header lost its stamp too; see CalendarScene).
              Press kit below keeps its own. */}
        </button>
      ) : null}
      {EPK_ENABLED ? (
        <button
          type="button"
          onClick={() => scopedRelease && toggleScene('epk', scopedRelease.id)}
          aria-pressed={activeScene === 'epk'}
          className={pillClass('epk')}
        >
          <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
          Press kit
          {/* No Beta stamp (founder call, 2026-08-16) — same call Calendar
              got on 2026-08-15. Neither scene's own header carries one
              either, so the label is the whole pill. */}
        </button>
      ) : null}
      {CAPTURE_ENABLED ? (
        <button
          type="button"
          onClick={() => scopedRelease && toggleScene('capture', scopedRelease.id)}
          aria-pressed={activeScene === 'capture'}
          className={pillClass('capture')}
        >
          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
          Fan capture
          {/* No Beta stamp (founder call, 2026-08-16), same as Press kit
              above. No pill in this row carries one now. */}
        </button>
      ) : null}
    </>
  );

  /**
   * Hidden once a scene is open: the "Activities" pill above is already the
   * way back, and a Calendar entry while Calendar (or any scene) is showing
   * is redundant chrome pointed at the thing already on screen.
   */
  const showOutboundPills =
    (CONTENT_CALENDAR_ENABLED || EPK_ENABLED || CAPTURE_ENABLED) &&
    Boolean(scopedRelease) &&
    !sceneContent;

  return (
    // `min-w-0` here is defensive: the panel is rendered both inside the
    // desktop two-pane grid (where the grid item carries min-w-0) AND as a
    // full-screen mobile drill-down. min-w-0 on the aside itself means the
    // panel's "shrink to fit container" contract holds regardless of how
    // the surrounding layout was wired. `flex-1` only takes effect on desktop,
    // where this is a direct grid child that stretches to fill its row track
    // (see WorkspaceDesktopFocused) — on mobile, where it's an ordinary block
    // child in normal page flow, `flex: 1 1 0%` on a non-flex-item is inert.
    <aside id={id} className="flex min-h-0 min-w-0 flex-1 flex-col scroll-mt-20">
      {/* Desktop header row (lg+ ONLY). Below `lg` these same pills render in
          the sticky dock at the base of this panel instead — see the dock
          block at the very bottom of this component — so this row is simply
          `hidden` there, rather than the sticky-at-top row it was until
          2026-08-14 (founder call: all the pills move to the bottom on mobile,
          stacked, and stay in view).

          It needs no sticky treatment of its own: at lg+ this panel lives
          inside WorkspaceDesktopFocused's viewport-locked, `overflow-hidden`
          grid, so this row sits OUTSIDE the scrolling body and is always
          visible by construction. That same overflow:hidden is why the old
          `sticky top-16` had to carry an `lg:static` escape hatch — it made
          the grid the nearest scrollport and pushed the row 64px DOWN into the
          body. With the row desktop-only, both the sticky and the escape hatch
          are gone, and so is the hazard.

          Right-aligned and wrapping, exactly as it has rendered at lg+ since
          2026-08-05 — desktop never had the mobile row's overflow bugs, so
          nothing about its appearance changes here. */}
      <div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 pb-3 pt-1 lg:flex">
        {primaryPills}
        {notesPill}
        {extraActions}
      </div>

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
          header row above, the mobile dock below — so the scene switcher never
          disappears (founder call, 2026-08-05). */}
      <div className="min-h-0 flex-1 pb-4 lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
      {sceneContent ? (
        sceneContent
      ) : (
      <div className="space-y-3">
        {activitiesBanner}
        {/* Every bucket empty: the buckets below have all suppressed
            themselves, so this stands in for the whole list.
            Actionable rather than a muted line (URG-233) — an empty panel
            whose only affordance is a small pill in the header row reads as
            "nothing to do here" instead of "start here". Skipped when the
            banner already covers both jobs. */}
        {!bannerReplacesEmptyState &&
        sectionOrder.every((sectionKey) => sections[sectionKey].length === 0) ? (
          <div className="px-1 py-6 text-center">
            <p className="text-sm text-content-secondary">
              {scopedRelease ? 'No activities for this release yet.' : 'No activities yet.'}
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
      </div>

      {/* Desktop footer row (lg+ ONLY) — Calendar, then Press kit beside it
          (the latter joined 2026-08-14, founder call, moving out of the header
          row where it had sat since URG-198).

          Calendar arrived here 2026-08-13 (founder call, third placement,
          corrected twice via screenshot: not the identity card's nav list, not
          the card's footer, and not floating just under the collapsed buckets
          either). The final arrow pointed at the BASE of the activities
          column, so this is a footer of the PANEL, not an item in the list: a
          sibling AFTER the flex-1 scroll body, which pins it to the bottom of
          the panel whether or not the task list overflows — the list scrolls
          behind it, this row never moves.

          Below `lg` these two pills are no longer a row of their own; they are
          the tail of the single dock further down (2026-08-14). That is why
          this is `hidden lg:flex` and no longer carries the horizontal-scroller
          treatment it needed on a phone: at lg+ the two tagged pills have never
          come close to running out of room. */}
      {showOutboundPills ? (
        <div className="hidden shrink-0 items-center gap-2 pb-2 pt-3 lg:flex">
          {outboundPills}
        </div>
      ) : null}

      {/* Mobile pill dock (below `lg` ONLY) — founder call, 2026-08-14: "move
          all the button pills to the bottom on mobile stacked on top each
          other and all sticky". One block holds EVERY pill this panel owns
          (the header row's and the footer row's alike, in that order), wrapping
          onto as many rows as it needs, docked to the bottom of the screen
          while the activity list scrolls behind it.

          Why wrap rather than the horizontal scroller both rows used before:
          scrolling hid pills off-screen — the failure mode that produced the
          cropped "lendar" pill in the 2026-08-10 screenshot — and a bottom dock
          is a destination, not a strip you drag. Wrapping keeps every entry
          point visible at once, which is the whole point of collecting them
          here. Pills stay `shrink-0 whitespace-nowrap` (see `pillClass`), so
          they break BETWEEN pills and never inside a label.

          `sticky` (not `fixed`): the dock is the last child in flow, so when
          the page is scrolled to the very bottom it settles at its natural
          place after the list rather than covering it. Nothing is ever
          permanently hidden behind it, and no spacer padding is needed to
          compensate — which a fixed bar would have required. On a short list
          that fits the screen the dock simply sits under it, unstuck; that is
          the standard sticky-footer trade and it reads fine.

          The bottom offset clears whichever fixed surface already owns the
          screen's edge (MobileNavBar, or the floating UrgAns/support
          launcher) — see TASKS_PILL_DOCK_OFFSET_CLASS and the two rules in
          globals.css. `z-20` puts it above the scrolling list but below the
          nav bar (`z-30`) and every modal.

          The -mx/px bleed matches <main>'s own gutter at each breakpoint
          (AppShell.tsx: px-4 sm:px-5 md:px-6) so the dock's background reaches
          the true screen edges while its pills stay aligned with the content
          above — a docked toolbar, not a floating card. */}
      <div
        className={`sticky z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-stroke-subtle bg-bg-base px-4 pb-3 pt-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:hidden ${TASKS_PILL_DOCK_OFFSET_CLASS}`}
      >
        {primaryPills}
        {extraActions}
        {showOutboundPills ? outboundPills : null}
      </div>
    </aside>
  );
}
