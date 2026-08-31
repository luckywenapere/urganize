'use client';

import { useEffect, useId, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { Chappi, CHAPPI_MIN_SIZE } from '@urganize/ui';
import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  FolderOpen,
  Image as ImageIcon,
  ListChecks,
  Mail,
  Menu,
  Music,
  Newspaper,
  NotebookPen,
  Archive,
  PartyPopper,
  Users,
  Plus,
  Radio,
  Search,
  Sparkles,
  type LucideProps,
} from 'lucide-react';
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
import { resolveActiveScene } from '@/lib/scene-cache';

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
//
// Only takes effect at `lg`+ (both values are min-width breakpoints), so
// reusing the same Metadata button below `lg` — in the new mobile top-tabs
// row — is always safe: within the range that row renders, this class hasn't
// started hiding anything yet.
// Exported so WorkspaceSkeleton reserves the placeholder at exactly the same
// breakpoints (the loading-skeleton-sync rule that file documents; it has
// already drifted from this row once).
export const METADATA_PILL_HIDE_CLASS = !IDENTITY_PANEL_ENABLED
  ? ''
  : process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true'
    ? 'xl:hidden'
    : 'lg:hidden';

// Content calendar entry point (URG-157). Same flag that gates the calendar
// API routes. On mobile this is now one of the top TABS (see the "outbound"
// mobile row below) rather than a folded-menu item or a dock pill — moved
// there 2026-08-16 (founder request, screenshot reference) alongside Press
// kit, Recap and Metadata, the four things worth a permanent, always-visible
// entry point.
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';

// Files entry point (URG-182): same flag gates the assets API routes and the
// release detail page's Asset section.
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';

// Song entry point. Deliberately its OWN flag rather than FILES above: the
// founder switched the general file cabinet off, and the song is a different
// ask ("attach the master to this release") that happens to share the same
// storage underneath. Same flag gates the /song API routes, the `?scene=song`
// URL param in WorkspaceView, and UrgAns's upload card.
const SONG_UPLOAD_ENABLED = process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true';

// Cover art entry point. Its own flag, same reasoning as Song above: the
// general file cabinet is off, and "update this release's cover image" is a
// different, more central ask than "bring the file manager back" — even
// though both share the same assets table and release-assets bucket.
const COVER_ART_ENABLED = process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true';

// Press kit entry point (URG-198): the EPK shipped (URG-196) reachable only
// from the release detail page's side menu — invisible from the workspace
// users actually land on. Same flag that gates the EPK page and API routes.
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

// Fan capture entry point (2026-08-14). On mobile this lives in the folded
// "more" menu rather than the top tabs — see the 2026-08-16 mobile redesign
// note below for why it isn't one of the four permanent tabs.
const CAPTURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true';

// Timeline entry point (2026-08-30). Same flag gates the ?scene=timeline URL
// param in lib/scene-cache.ts, so a stale bookmark reads as no-scene when it
// is off. The scene has no API routes to gate — it lays itself out from the
// activities this panel already has in props.
const TIMELINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TIMELINE === 'true';

// Notes entry point: same flag AppTopbar and the identity panel read.
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

// Playlist pitching entry point: same flag gates the curator surface, the
// /api/pitching routes and the /api/curator routes.
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

// Same flag AppShell/MobileNavBar read. Below `lg` the panel now shows two
// rows (top tabs, then the standalone-pills-plus-menu dock at the base — see
// the 2026-08-16 mobile redesign note), and how far up the dock has to sit
// still depends on which fixed surface already owns the screen's bottom
// edge — the nav bar when this is on, the floating UrgAns/support launcher
// when it isn't. Precomputed to a class so the dock's className stays a
// one-token swap, the same shape AppShell uses for <main>'s bottom padding.
// Both rules live in globals.css.
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
export const TASKS_PILL_DOCK_OFFSET_CLASS = MOBILE_NAV_ENABLED
  ? 'tasks-pill-dock-nav'
  : 'tasks-pill-dock';

/**
 * The scene-pill row's neutral (never-lit) pill treatment — hoisted to
 * module scope and exported as the one source of truth. WorkspaceView's
 * Status update / Release recap actions render through this same class
 * (via `statusUpdateAction`/`recapAction` below) rather than a hand-rolled
 * copy — that copy had already drifted once (missing `shrink-0
 * whitespace-nowrap`), which is how "Get your release recap" ended up
 * wrapping across three lines inside a fixed 32px pill (2026-08-10 bug fix).
 * `shrink-0 whitespace-nowrap` still matter for the same reason in every new
 * container this pill can land in: a flex child without them compresses and
 * breaks its own label mid-phrase instead of moving whole onto the next row.
 */
export const taskPanelPillClass =
  'motion-focus motion-press inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover';

/**
 * A flag-gated AI action ported from the removed release detail page
 * (Status update, Release recap). Structured rather than pre-rendered
 * ReactNode: this component places each one in a different spot at each
 * width (the desktop header row, the mobile top tabs, or the mobile folded
 * "more" menu), and the folded menu's search needs a real label to filter
 * against — a rendered `<button>` blob can't be introspected for its text.
 */
export type TaskPanelAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

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
   * The Status update AI action, ported from the removed release detail
   * page. Structured (see `TaskPanelAction`) so this component can render it
   * in the right place at each width — see the type's own doc comment.
   * `null`/undefined when the feature is off or no release is scoped.
   */
  statusUpdateAction?: TaskPanelAction | null;
  /** The Release recap action, alongside `statusUpdateAction` above. `null`
   * when the flag is off, no release is scoped, or the release isn't
   * recap-eligible yet (WorkspaceView owns that eligibility check). */
  recapAction?: TaskPanelAction | null;
  /** Shelve a finished release, or restore an archived one. Modal-shaped like
   *  recap, so it lives in the same two places. */
  archiveAction?: TaskPanelAction | null;
  changeArtistAction?: TaskPanelAction | null;
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

/** One entry in the mobile "more" menu — the folded pills that don't earn a
 * permanent spot on a phone (see the 2026-08-16 redesign note below). Data,
 * not JSX: the menu's search filters on `label`, which a pre-rendered button
 * can't be introspected for. */
type MoreMenuAction = {
  key: string;
  label: string;
  icon: ComponentType<LucideProps>;
  onClick: () => void;
  disabled?: boolean;
};

export function TasksPanel({
  tasks,
  scopedRelease,
  id,
  statusUpdateAction,
  recapAction,
  archiveAction,
  changeArtistAction,
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
  // Shared with WorkspaceView (which builds the scene body) and
  // WorkspaceSkeleton (which reserves its layout) rather than mirrored here:
  // with a flag off, a stale `?scene=…` URL must not flip the leading pill to
  // "Activities" for a scene that isn't rendering. This used to be a local copy
  // of the same four-flag expression and it had drifted — 'song' and 'coverart'
  // were missing from it for a while — which is exactly why it now lives in
  // lib/scene-cache.ts.
  const activeScene = resolveActiveScene(urlScene);

  /**
   * Pill classes, lit when that scene is the open one. `shrink-0
   * whitespace-nowrap` (2026-08-10 bug fix): a flex child is free to
   * compress and break its own label mid-phrase rather than moving whole onto
   * the next row without these — which is exactly how "Get your release
   * recap" used to spill across three lines inside a fixed 32px pill.
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
  // component) so WorkspaceView's Status update / Recap actions use the real
  // thing instead of a hand-rolled copy.
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

  // The mobile "more" menu (2026-08-16 redesign, below) — collapsed by
  // default, so nothing here is reserved in the skeleton (the Plan-pill
  // precedent: data this component doesn't have yet gets no guessed width).
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [moreMenuQuery, setMoreMenuQuery] = useState('');
  const moreMenuListId = useId();

  const toggleMoreMenu = () => {
    setIsMoreMenuOpen((open) => {
      const next = !open;
      // Fresh state on every open, not just on close: a query left over from
      // a previous look at the menu should not silently filter the next one.
      if (!next) setMoreMenuQuery('');
      return next;
    });
  };

  /**
   * Toggles with the scene body below: "New activity" opens Quick Create
   * while the activity list is showing; once a scene (Calendar / Files /
   * Press kit / Song / …) has taken this slot, the SAME button position
   * becomes "Activities" so there's always a way back without hunting for
   * the scene's own pill again.
   *
   * Desktop header row ONLY as of 2026-08-17 — mobile dropped this entirely
   * (see the base-dock comment further down): the center "+" in
   * `MobileNavBar` now opens Quick Create directly when a release is scoped,
   * so a dedicated mobile pill for that action is redundant, and closing a
   * scene on mobile works by re-tapping its own top-tab/folded-menu entry
   * (every scene entry point is already a toggle).
   */
  const activitiesToggleButton = activeScene ? (
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
  );

  // Plan: first while it exists. A release with no activities has exactly
  // one job, and this is it; once a plan is approved the pill disappears,
  // because from then on the activity list IS the plan. Only shown while
  // there is something to open (no activities yet, or a draft already
  // waiting) so it never becomes permanent chrome. Desktop header row only —
  // on mobile it lives in the folded "more" menu (see below).
  const planButton =
    showPlanPill && scopedRelease ? (
      <button
        type="button"
        onClick={() => toggleScene('plan', scopedRelease.id)}
        aria-pressed={activeScene === 'plan'}
        className={pillClass('plan')}
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        Plan
      </button>
    ) : null;

  // Metadata (URG-108). Desktop: NARROW widths only, since the identity
  // panel's "Collect metadata" nav item is this release's persistent entry
  // point at wide widths (WorkspaceIdentityPanel) and two controls for one
  // scene is noise — see METADATA_PILL_HIDE_CLASS above for exactly where it
  // retreats. Mobile (2026-08-16): one of the three permanent top tabs
  // (Calendar / Metadata / Pitch as of 2026-08-17), where that hide class is
  // always inert (it only ever fires at/above `lg`).
  // Timeline sits closest to Activities in both rows: it is the same activities
  // seen a different way, so it reads as a view switch rather than another
  // release surface.
  const timelineButton =
    TIMELINE_ENABLED && scopedRelease ? (
      <button
        type="button"
        onClick={() => toggleScene('timeline', scopedRelease.id)}
        aria-pressed={activeScene === 'timeline'}
        className={pillClass('timeline')}
      >
        Timeline
      </button>
    ) : null;

  const metadataButton =
    METADATA_ENABLED && scopedRelease ? (
      <button
        type="button"
        onClick={() => toggleScene('metadata', scopedRelease.id)}
        aria-pressed={activeScene === 'metadata'}
        className={`${pillClass('metadata')} ${METADATA_PILL_HIDE_CLASS}`}
      >
        <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
        Collect metadata
      </button>
    ) : null;

  // Cover art: the release's visual identity — shown on its workspace card,
  // its press kit, and anywhere else the release is displayed. Desktop
  // header row only — on mobile it lives in the folded "more" menu, right
  // beside Song (both are the release's core identity assets).
  const coverArtButton =
    COVER_ART_ENABLED && scopedRelease ? (
      <button
        type="button"
        onClick={() => toggleScene('coverart', scopedRelease.id)}
        aria-pressed={activeScene === 'coverart'}
        className={pillClass('coverart')}
      >
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        Cover art
      </button>
    ) : null;

  // Song: the master itself. Desktop header row only — on mobile it lives in
  // the folded "more" menu.
  const songButton =
    SONG_UPLOAD_ENABLED && scopedRelease ? (
      <button
        type="button"
        onClick={() => toggleScene('song', scopedRelease.id)}
        aria-pressed={activeScene === 'song'}
        className={pillClass('song')}
      >
        <Music className="h-3.5 w-3.5" aria-hidden="true" />
        Song
      </button>
    ) : null;

  // Playlist pitching: browse curator playlists and send this release's
  // song, with each curator's answer shown beside it. Mobile (2026-08-17):
  // one of the three top tabs, alongside Calendar and Collect metadata —
  // pitching is frequent enough to earn a permanent, always-visible spot
  // rather than the folded menu (it was its own standalone pill until this
  // date, when Recap took that row's other slot instead — see the top-tabs
  // and base-dock comments further down).
  const pitchButton =
    PITCHING_ENABLED && scopedRelease ? (
      <button
        type="button"
        onClick={() => toggleScene('pitch', scopedRelease.id)}
        aria-pressed={activeScene === 'pitch'}
        className={pillClass('pitch')}
      >
        <Radio className="h-3.5 w-3.5" aria-hidden="true" />
        Pitch
      </button>
    ) : null;

  // Files link: its own scene (URG-165), not a segment nested under the task
  // list — files are a peer of tasks, not a child of them. Desktop header row
  // only — on mobile it lives in the folded "more" menu.
  const filesButton =
    FILES_ENABLED && scopedRelease ? (
      <button
        type="button"
        onClick={() => toggleScene('files', scopedRelease.id)}
        aria-pressed={activeScene === 'files'}
        className={pillClass('files')}
      >
        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
        Files
      </button>
    ) : null;

  /**
   * Notes for this release — DESKTOP ONLY (founder call, 2026-08-15: notes
   * should not be one of the mobile pills), which is why it is its own
   * variable rather than composed alongside the buttons above: it is rendered
   * into the desktop header row and simply never handed to mobile. Kept as a
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

  // Calendar, Press kit — the desktop footer row's outbound pair. Fan
  // capture used to sit alongside them here; on mobile it moved to the
  // folded "more" menu (2026-08-16), so it's built separately below rather
  // than as a third member of this pair.
  const calendarButton = CONTENT_CALENDAR_ENABLED ? (
    <button
      type="button"
      onClick={() => scopedRelease && toggleScene('calendar', scopedRelease.id)}
      aria-pressed={activeScene === 'calendar'}
      className={pillClass('calendar')}
    >
      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
      Calendar
    </button>
  ) : null;

  const epkButton = EPK_ENABLED ? (
    <button
      type="button"
      onClick={() => scopedRelease && toggleScene('epk', scopedRelease.id)}
      aria-pressed={activeScene === 'epk'}
      className={pillClass('epk')}
    >
      <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
      Press kit
    </button>
  ) : null;

  const captureButton = CAPTURE_ENABLED ? (
    <button
      type="button"
      onClick={() => scopedRelease && toggleScene('capture', scopedRelease.id)}
      aria-pressed={activeScene === 'capture'}
      className={pillClass('capture')}
    >
      <Mail className="h-3.5 w-3.5" aria-hidden="true" />
      Fan capture
    </button>
  ) : null;

  const outboundPills = (
    <>
      {calendarButton}
      {epkButton}
      {captureButton}
    </>
  );

  /**
   * Hidden once a scene is open: the "Activities" pill above is already the
   * way back, and a Calendar entry while Calendar (or any scene) is showing
   * is redundant chrome pointed at the thing already on screen. Desktop
   * footer row only — the mobile top tabs and folded menu below deliberately
   * do NOT carry this restriction (see their own comments for why).
   */
  const showOutboundPills =
    (CONTENT_CALENDAR_ENABLED || EPK_ENABLED || CAPTURE_ENABLED) &&
    Boolean(scopedRelease) &&
    !sceneContent;

  // Status update / Release recap, rendered through the shared pill class
  // wherever they're needed (desktop row, mobile top tabs, mobile folded
  // menu) — see TaskPanelAction's own doc comment for why these arrive as
  // data rather than pre-rendered nodes.
  const statusUpdateButton = statusUpdateAction ? (
    <button
      type="button"
      onClick={statusUpdateAction.onClick}
      disabled={statusUpdateAction.disabled}
      className={`${neutralPillClass} disabled:opacity-60`}
    >
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      {statusUpdateAction.label}
    </button>
  ) : null;

  const recapButton = recapAction ? (
    <button type="button" onClick={recapAction.onClick} className={neutralPillClass}>
      <PartyPopper className="h-3.5 w-3.5" aria-hidden="true" />
      {recapAction.label}
    </button>
  ) : null;

  const archiveButton = archiveAction ? (
    <button type="button" onClick={archiveAction.onClick} className={neutralPillClass}>
      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
      {archiveAction.label}
    </button>
  ) : null;

  const changeArtistButton = changeArtistAction ? (
    <button type="button" onClick={changeArtistAction.onClick} className={neutralPillClass}>
      <Users className="h-3.5 w-3.5" aria-hidden="true" />
      {changeArtistAction.label}
    </button>
  ) : null;

  /**
   * Mobile top tabs (2026-08-16, founder request via screenshot reference).
   * The permanent, always-visible entry points on a phone: Calendar,
   * Collect metadata, Pitch. Unlike the desktop footer's outbound pair,
   * these do NOT hide while a scene is open — the whole point of a tab strip
   * is that every tab stays reachable and the active one is highlighted,
   * matching the reference (all tabs visible, "Logs" lit).
   *
   * All three are scene toggles (Pitch included, as of 2026-08-17 — it was a
   * standalone base-dock pill before that date) and all three light up via
   * `aria-pressed` when their scene is open.
   *
   * Press kit and Recap are NOT part of this row. Press kit moved to the
   * folded "more" menu 2026-08-17 (which is why `epkButton` doesn't appear
   * here even though the variable still exists — desktop's footer row still
   * uses it, unchanged). Recap joined it there the same day: it opens a
   * modal rather than a scene, so it never lit up here anyway, and the
   * folded menu is where the other non-scene AI action (Status update)
   * already lives.
   */
  const hasMobileTopTabs = Boolean(
    scopedRelease && (timelineButton || calendarButton || metadataButton || pitchButton)
  );

  // The folded "more" menu (2026-08-16; Press kit and Recap added
  // 2026-08-17) — everything that isn't a top tab or, on mobile, in the
  // panel's own scroll body. Data, not JSX, so the search box above the list
  // can filter on a real label. Order mirrors the rough priority the desktop
  // row already implies: Plan first (it's the one thing a plan-less release
  // needs), then Cover art, Song and Files — the release's core identity
  // assets — then the two AI actions from the removed release detail page
  // (Status update, Recap) grouped together, then Press kit and Fan capture
  // together at the end — the two "send this outward" items, same pairing
  // the desktop footer row keeps them in.
  // Deliberately NOT memoized: each entry's onClick closes over `toggleScene`,
  // which itself closes over the current `activeScene` — memoizing this array
  // risks serving a stale closure (tap "Song" after switching scenes without
  // this array's own deps changing, and it would toggle against a scene that
  // is no longer the open one). The array is eight items at most, so
  // recomputing it every render costs nothing worth guarding against.
  const moreMenuActionsRaw: (MoreMenuAction | null)[] = [
    showPlanPill && scopedRelease
      ? {
          key: 'plan',
          label: 'Plan',
          icon: Sparkles,
          onClick: () => toggleScene('plan', scopedRelease.id),
        }
      : null,
    COVER_ART_ENABLED && scopedRelease
      ? {
          key: 'coverart',
          label: 'Cover art',
          icon: ImageIcon,
          onClick: () => toggleScene('coverart', scopedRelease.id),
        }
      : null,
    SONG_UPLOAD_ENABLED && scopedRelease
      ? {
          key: 'song',
          label: 'Song',
          icon: Music,
          onClick: () => toggleScene('song', scopedRelease.id),
        }
      : null,
    FILES_ENABLED && scopedRelease
      ? {
          key: 'files',
          label: 'Files',
          icon: FolderOpen,
          onClick: () => toggleScene('files', scopedRelease.id),
        }
      : null,
    statusUpdateAction
      ? {
          key: 'status-update',
          label: statusUpdateAction.label,
          icon: Sparkles,
          onClick: statusUpdateAction.onClick,
          disabled: statusUpdateAction.disabled,
        }
      : null,
    // Recap moved here 2026-08-17 from the mobile top tabs — it opens a
    // modal, not a scene, so it never lit up like its former neighbours
    // there anyway, and this groups it with the other AI action (Status
    // update) from the removed release detail page.
    recapAction
      ? {
          key: 'recap',
          label: recapAction.label,
          icon: PartyPopper,
          onClick: recapAction.onClick,
          disabled: recapAction.disabled,
        }
      : null,
    // Archive sits with recap for the same reason: it opens a modal rather
    // than a scene, so it would never light up among the top tabs.
    archiveAction
      ? {
          key: 'archive',
          label: archiveAction.label,
          icon: Archive,
          onClick: archiveAction.onClick,
          disabled: archiveAction.disabled,
        }
      : null,
    // Same reasoning as archive and recap: a modal, never a lit tab. It also
    // belongs with them because all three are corrective or terminal actions
    // rather than places to work.
    changeArtistAction
      ? {
          key: 'change-artist',
          label: changeArtistAction.label,
          icon: Users,
          onClick: changeArtistAction.onClick,
          disabled: changeArtistAction.disabled,
        }
      : null,
    EPK_ENABLED && scopedRelease
      ? {
          key: 'epk',
          label: 'Press kit',
          icon: Newspaper,
          onClick: () => toggleScene('epk', scopedRelease.id),
        }
      : null,
    CAPTURE_ENABLED && scopedRelease
      ? {
          key: 'capture',
          label: 'Fan capture',
          icon: Mail,
          onClick: () => toggleScene('capture', scopedRelease.id),
        }
      : null,
  ];
  const moreMenuActions = moreMenuActionsRaw.filter(
    (item): item is MoreMenuAction => item !== null
  );

  const query = moreMenuQuery.trim().toLowerCase();
  const filteredMoreMenuActions = query
    ? moreMenuActions.filter((action) => action.label.toLowerCase().includes(query))
    : moreMenuActions;

  const handleMoreMenuSelect = (action: MoreMenuAction) => {
    action.onClick();
    setIsMoreMenuOpen(false);
    setMoreMenuQuery('');
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
    <aside id={id} className="flex min-h-0 min-w-0 flex-1 flex-col scroll-mt-20">
      {/* Desktop header row (lg+ ONLY). Below `lg` these buttons render
          across two mobile-only rows instead — the top tabs, and the
          standalone-pills-plus-menu dock at the base — see those blocks
          further down.

          It needs no sticky treatment of its own: at lg+ this panel lives
          inside WorkspaceDesktopFocused's viewport-locked, `overflow-hidden`
          grid, so this row sits OUTSIDE the scrolling body and is always
          visible by construction.

          Right-aligned and wrapping, exactly as it has rendered at lg+ since
          2026-08-05. */}
      <div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 pb-3 pt-1 lg:flex">
        {activitiesToggleButton}
        {planButton}
        {timelineButton}
        {metadataButton}
        {coverArtButton}
        {songButton}
        {pitchButton}
        {filesButton}
        {notesPill}
        {statusUpdateButton}
        {recapButton}
        {changeArtistButton}
        {archiveButton}
      </div>

      {/* Mobile top tabs (below `lg` ONLY) — 2026-08-16, founder request via
          screenshot reference (a Vercel-style tab strip: every tab stays
          visible, the active one lit). Corrected 2026-08-17: Press kit moved
          out to the folded "more" menu (it isn't reached often enough to
          earn a permanent tab, and the row read as crowded), and — later the
          same day — Recap swapped places with Pitch: Recap moved into the
          folded menu (it opens a modal, not a scene, so it never lit up like
          its neighbours here), and Pitch moved up from the standalone
          base-dock row into this strip instead, since it IS a scene toggle
          like Calendar and Collect metadata and reads naturally alongside
          them.

          Horizontally scrollable with the same gutter-matching bleed the old
          dock used (`-mx-4 px-4` stepping up at sm/md): even three pills
          including the long "Collect metadata" label don't reliably fit a
          375px screen, and a strip that scrolls beats one that wraps for a
          tab bar — wrapping would make the "always visible, tap to switch"
          read of a tab bar collapse into something that looks like the pill
          dock underneath it. */}
      {hasMobileTopTabs ? (
        <div className="-mx-4 flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 pt-1 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:hidden">
          {timelineButton}
          {calendarButton}
          {metadataButton}
          {pitchButton}
        </div>
      ) : null}

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

      {/* Desktop footer row (lg+ ONLY) — Calendar, then Press kit beside it.
          A sibling AFTER the flex-1 scroll body, which pins it to the bottom
          of the panel whether or not the task list overflows — the list
          scrolls behind it, this row never moves. Mobile has its own,
          differently-organized rows above and below instead (2026-08-16). */}
      {showOutboundPills ? (
        <div className="hidden shrink-0 items-center gap-2 pb-2 pt-3 lg:flex">
          {outboundPills}
        </div>
      ) : null}

      {/* Mobile base dock (below `lg` ONLY) — redesigned 2026-08-16 (founder
          request, screenshot reference) from "every pill in one wrapping
          block" into a folded "more" menu, entered via the search or
          hamburger icon buttons, holding everything else this panel used to
          put in the old dock: Plan (while it exists), Cover art, Song,
          Files, Status update, Recap, Press kit, Fan capture. Filterable by
          the search box inside it.

          The row used to also carry two permanent standalone pills — New
          activity/Activities and Pitch — removed 2026-08-17: Pitch moved up
          into the top-tabs strip above (it's a scene toggle like Calendar
          and Collect metadata, so it belongs there now), and New activity
          was retired outright — the center "+" in `MobileNavBar` opens
          Quick Create directly when a release is scoped, so a second,
          release-scoped entry point for the same action here was redundant.
          Losing "Activities" (the same button's back-from-a-scene state)
          costs nothing functionally: every scene's own entry point, top tab
          or folded-menu item alike, is already a toggle — re-tapping it
          closes the scene just as well.

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
        className={`sticky z-20 -mx-4 flex flex-col gap-2 px-4 pb-3 pt-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:hidden ${TASKS_PILL_DOCK_OFFSET_CLASS}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {moreMenuActions.length > 0 ? (
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {/* touch-manipulation on both: disables the browser's own
                  double-tap-to-zoom gesture on these specific buttons
                  (independent of the input font-size fix below — this
                  guards against the tap itself zooming the page, not just
                  a focused field zooming it), while leaving pinch-zoom
                  available everywhere else for accessibility. */}
              <button
                type="button"
                onClick={toggleMoreMenu}
                aria-expanded={isMoreMenuOpen}
                aria-controls={moreMenuListId}
                aria-label="Search the menu"
                className="motion-focus motion-press grid h-8 w-8 shrink-0 touch-manipulation place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
              >
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={toggleMoreMenu}
                aria-expanded={isMoreMenuOpen}
                aria-controls={moreMenuListId}
                aria-label="More"
                className="motion-focus motion-press grid h-8 w-8 shrink-0 touch-manipulation place-items-center rounded-full border border-stroke-default bg-bg-surface text-content-secondary transition-colors hover:bg-bg-hover hover:text-content-primary"
              >
                <Menu className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        {isMoreMenuOpen ? (
          <div
            id={moreMenuListId}
            className="rounded-xl border border-stroke-default bg-bg-surface p-2 shadow-[0_20px_50px_-20px_rgb(var(--shadow-ink)/calc(0.6*var(--shadow-alpha-scale)))]"
          >
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-content-tertiary"
                aria-hidden="true"
              />
              {/*
                No `autoFocus`, deliberately: tapping either trigger button
                used to focus this field the instant the panel opened, which
                on iOS Safari means an unwanted page zoom on tap — a field
                under 16px triggers it on focus. Both buttons now just open
                the menu; the user taps into the field themselves to search.

                `text-lg`, NOT `text-base` — the fix originally shipped as
                `text-base`, and the zoom kept happening because this
                project's own type scale (packages/config/tailwind/preset.js)
                redefines `base` to 14px, not Tailwind's stock 16px. `lg` is
                the first step in THIS preset that actually clears iOS's
                threshold. Kept as a second, independent guard beyond removing
                `autoFocus`: even a manual tap into this field can never
                trigger the zoom now, regardless of what focuses it.
              */}
              <input
                type="text"
                value={moreMenuQuery}
                onChange={(event) => setMoreMenuQuery(event.target.value)}
                placeholder="Search…"
                className="motion-focus h-9 w-full rounded-full border border-stroke-default bg-bg-elevated pl-9 pr-3 text-lg text-content-primary placeholder:text-content-tertiary"
              />
            </div>
            <ul className="mt-1 max-h-60 overflow-y-auto">
              {filteredMoreMenuActions.length === 0 ? (
                <li className="py-3 text-center text-xs text-content-tertiary">No matches.</li>
              ) : (
                filteredMoreMenuActions.map((action) => (
                  <li key={action.key}>
                    <button
                      type="button"
                      onClick={() => handleMoreMenuSelect(action)}
                      disabled={action.disabled}
                      className="motion-focus flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm text-content-primary transition-colors hover:bg-bg-hover disabled:opacity-60"
                    >
                      <action.icon
                        className="h-4 w-4 shrink-0 text-content-tertiary"
                        aria-hidden="true"
                      />
                      {action.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
