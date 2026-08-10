'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronDown, ClipboardList, FolderOpen, ListChecks, Newspaper, NotebookPen, Plus, Radio } from 'lucide-react';
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

// Content calendar entry point (URG-157): the workspace is the surface users
// actually land on after login, so the scoped-release header carries the
// calendar affordance alongside Files rather than hiding it on the release
// detail page alone.
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';

// Files entry point (URG-182): same flag gates the assets API routes and the
// release detail page's Asset section.
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';

// Press kit entry point (URG-198): the EPK shipped (URG-196) reachable only
// from the release detail page's side menu — invisible from the workspace
// users actually land on. Same flag that gates the EPK page and API routes.
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

// Metadata hub entry point (URG-108): distribution fields + collaborator
// credit capture, the third conscious v1 scope expansion (see CLAUDE.md).
// Same shape as the Press kit link above.
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';

// Notes entry point: same flag AppTopbar and the identity panel read.
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

// Playlist pitching entry point: same flag gates the curator surface, the
// /api/pitching routes and the /api/curator routes.
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';

// Overdue first (genuine slippage, most urgent), then Catch Up (start-here
// for compressed-runway plans — calm, neutral framing), then standard
// time-based buckets. Catch Up is empty on long-running releases where every
// past-due task is real slippage, so the bucket only takes vertical space
// when it has signal to add. Done sits at the bottom — it's a terminal
// section that completion routes to, collapsed by default.
const sectionOrder: TaskSectionKey[] = [
  'overdue',
  'catch_up',
  'today',
  'week',
  'upcoming',
  'no_due_date',
  'done',
];

// Default expanded state: every bucket collapsed. The header counts carry
// the signal at a glance; opening a bucket is a deliberate act, and once the
// user opens or closes one it stays that way (persisted to localStorage)
// until they change it again.
const DEFAULT_EXPANDED: Record<TaskSectionKey, boolean> = {
  overdue: false,
  catch_up: false,
  today: false,
  week: false,
  upcoming: false,
  no_due_date: false,
  done: false,
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
   * scene (Metadata / Calendar / Files / Press kit) is its own task, and a
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
};

export function TasksPanel({
  tasks,
  scopedRelease,
  id,
  extraActions,
  sceneContent,
  activitiesBanner,
  bannerReplacesEmptyState = false,
}: TasksPanelProps) {
  // openTask opens the global task detail pop-up mounted by TaskUIProvider —
  // this panel stays where it is underneath the modal.
  const { openTask, openQuickCreate } = useTaskUI();

  // The pills below swap this panel's body between the activity buckets and a
  // release scene (Metadata / Calendar / Files / Press kit), in place — they
  // were nav links to separate pages until 2026-08-04, then briefly modal
  // overlays, and are now an inline swap per the founder's correction. Clicking
  // the pill of the scene that's already open closes it, back to activities.
  const { activeScene, openScene, closeScene } = useSceneOverlay();

  /** Pill classes, lit when that scene is the open one. */
  const pillClass = (scene: SceneName) =>
    `motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
      activeScene === scene
        ? 'border-brand bg-brand/10 text-content-primary'
        : 'border-stroke-default bg-bg-surface text-content-primary hover:bg-bg-hover'
    }`;

  // Shared with the New activity / Activities toggle below — same neutral
  // (never-lit) treatment regardless of which of the two states it's in.
  const neutralPillClass =
    'motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover';

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
      {/* Sticky header (2026-08-05, founder call): pulled out of the
          scrolling body below so two things stop happening at once. (1) The
          native scrollbar for the body no longer runs past this row — before,
          both lived in one overflow-y-auto box, so the scrollbar's own width
          reflowed this right-aligned row every time it appeared/disappeared
          (a bucket opening, a scene swapping in). (2) The row now stays
          visible the whole time instead of scrolling away with the list —
          on desktop it already never scrolled (this sits outside the local
          scroll box entirely); on mobile, where the page itself scrolls,
          `sticky` keeps it docked just below the topbar (`top-16` = the
          topbar's `min-h-16`; AppTopbar is `sticky top-0` in the same
          document scroll, so this docks flush beneath it). `bg-bg-base`
          matches the page background so scrolled content doesn't show
          through as it passes underneath.

          `lg:static` (2026-08-05 bug fix): sticky is for MOBILE ONLY. On
          desktop this panel lives inside WorkspaceDesktopFocused, whose grid
          is `overflow-hidden` — and overflow:hidden makes that grid the
          nearest scrollport for sticky purposes. This row sits at the very
          top of that box in flow, so `sticky top-16` pushed it 64px DOWN
          into the scrolling body (tasks slid behind the pills, an empty band
          where the row belonged). At lg+ the row never needs sticky anyway —
          it's outside the scroll box, always visible by construction — so it
          goes back to static flow there. The lg boundary is exact: the only
          two mounts are WorkspaceView's mobile branch (`lg:hidden`) and
          WorkspaceDesktopFocused (inside `hidden lg:block`). */}
      <div className="sticky top-16 z-10 flex shrink-0 flex-wrap items-center justify-end gap-2 bg-bg-base pb-3 pt-1 lg:static">
        <div className="flex items-center gap-2">
          {/* Toggles with the scene body below: "New activity" opens Quick
              Create while the activity list is showing; once a scene (Metadata
              / Calendar / Files / Press kit) has taken this slot, the SAME
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
          {/* Metadata link (URG-108), FIRST among the scene links (founder
              call, 2026-08-04) — distribution fields + collaborator credits
              are the surface the founder reaches for most, now that the
              release detail page is gone and this header is the single
              navigation row for every release scene. */}
          {METADATA_ENABLED && scopedRelease ? (
            <button
              type="button"
              onClick={() => toggleScene('metadata', scopedRelease.id)}
              aria-pressed={activeScene === 'metadata'}
              className={pillClass('metadata')}
            >
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              Metadata
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                Beta
              </span>
            </button>
          ) : null}
          {/* Calendar (URG-157). Opens as a WIDE overlay window rather than the
              small one the other scenes get — its month grid needs ~1200px, and
              at narrower widths it already falls back to its own agenda list.
              (Until 2026-08-04 this was a nav Link to a full page, on the
              reasoning that the panel couldn't give the grid enough width; the
              window can.) */}
          {CONTENT_CALENDAR_ENABLED && scopedRelease ? (
            <button
              type="button"
              onClick={() => toggleScene('calendar', scopedRelease.id)}
              aria-pressed={activeScene === 'calendar'}
              className={pillClass('calendar')}
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Calendar
              {/* Beta stamp (2026-07-23): the content calendar ships as Beta. */}
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                Beta
              </span>
            </button>
          ) : null}
          {/* Files link: its own page (URG-165), not a segment nested under
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
          {/* Press kit link (URG-198): same shape as Calendar/Files above —
              the workspace is where users land, so every release surface
              gets its entry point here. */}
          {EPK_ENABLED && scopedRelease ? (
            <button
              type="button"
              onClick={() => toggleScene('epk', scopedRelease.id)}
              aria-pressed={activeScene === 'epk'}
              className={pillClass('epk')}
            >
              <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
              Press kit
              {/* Beta stamp, same tag as Calendar above — the press kit
                  generator shipped 2026-07-31 and is still early. */}
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                Beta
              </span>
            </button>
          ) : null}
          {/* Playlist pitching: browse curator playlists and send this
              release's song, with each curator's answer shown beside it. */}
          {PITCHING_ENABLED && scopedRelease ? (
            <button
              type="button"
              onClick={() => toggleScene('pitch', scopedRelease.id)}
              aria-pressed={activeScene === 'pitch'}
              className={pillClass('pitch')}
            >
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              Pitch
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                Beta
              </span>
            </button>
          ) : null}
          {/* Notes for this release. Deliberately a plain LINK, not a scene
              toggle like its neighbours: notes are a global surface that
              happens to filter by release, not a per-release panel body — so
              this navigates to the notes page pre-filtered rather than
              swapping this panel's contents. (Not a regression of the
              2026-08-05 "scenes render inline, not as pages" call: that call
              was about the four release scenes, which stay inline.) */}
          {NOTES_ENABLED && scopedRelease ? (
            <Link
              href={`/dashboard/notes?release=${scopedRelease.id}`}
              className={neutralPillClass}
            >
              <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
              Notes
            </Link>
          ) : null}
          {extraActions}
        </div>
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
          activity buckets do; the header row above stays put either way, so
          the scene switcher never disappears (founder call, 2026-08-05). */}
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
          // extending what Done already did): a bucket appears the moment a
          // task moves into it and disappears when its last task leaves.
          // The all-empty case gets a single quiet line below the list.
          if (sectionTasks.length === 0) return null;
          const bodyId = `workspace-bucket-${sectionKey}`;
          return (
            <div
              key={sectionKey}
              className={`overflow-hidden rounded-xl border border-stroke-default ${
                isDoneBucket ? 'bg-bg-surface/60' : 'bg-bg-surface'
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
                <span
                  className={`text-sm font-semibold ${
                    sectionKey === 'overdue'
                      ? 'text-status-error'
                      : isDoneBucket
                        ? 'text-content-secondary'
                        : 'text-content-primary'
                  }`}
                >
                  {getTaskSectionLabel(sectionKey)}
                  <span className="ml-2 font-normal text-content-tertiary">
                    ({sectionTasks.length})
                  </span>
                </span>
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
    </aside>
  );
}
