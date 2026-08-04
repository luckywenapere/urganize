'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronDown, ClipboardList, FolderOpen, Newspaper, Plus } from 'lucide-react';
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
};

export function TasksPanel({ tasks, scopedRelease, id, extraActions }: TasksPanelProps) {
  // openTask opens the global task detail pop-up mounted by TaskUIProvider —
  // this panel stays where it is underneath the modal.
  const { openTask, openQuickCreate } = useTaskUI();

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
    // the surrounding layout was wired.
    <aside id={id} className="min-w-0 space-y-3 scroll-mt-20">
      {/* No "Tasks" eyebrow on the left (founder call, 2026-07-23 — the
          list is activities now and the scope pill already names the song);
          the header row keeps only the action cluster, right-aligned. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          {/* New-task affordance: opens the global Quick Create modal with the
              currently-scoped release pre-selected (or empty when nothing is
              scoped, leaving the picker for the user). Source = 'inline' to
              tag analytics with the panel-of-origin. Renders on both desktop
              and mobile — the workspace is the primary task-creation surface
              now that the legacy /dashboard/tasks page is gone. */}
          <button
            type="button"
            onClick={() =>
              openQuickCreate({
                releaseId: scopedRelease?.id || undefined,
                source: 'inline',
              })
            }
            className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New activity
          </button>
          {/* Metadata link (URG-108), FIRST among the scene links (founder
              call, 2026-08-04) — distribution fields + collaborator credits
              are the surface the founder reaches for most, now that the
              release detail page is gone and this header is the single
              navigation row for every release scene. */}
          {METADATA_ENABLED && scopedRelease ? (
            <Link
              href={`/dashboard/releases/${scopedRelease.id}/metadata`}
              className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover"
            >
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              Metadata
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                Beta
              </span>
            </Link>
          ) : null}
          {/* Calendar link: the primary navigation into the release's content
              calendar (URG-157). A nav Link, not a toggle — the calendar is a
              full page (month grid needs width the panel doesn't have). Only
              renders when a release is scoped, same gate as Files. */}
          {CONTENT_CALENDAR_ENABLED && scopedRelease ? (
            <Link
              href={`/dashboard/releases/${scopedRelease.id}/calendar`}
              className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover"
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Calendar
              {/* Beta stamp (2026-07-23): the content calendar ships as Beta. */}
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                Beta
              </span>
            </Link>
          ) : null}
          {/* Files link: its own page (URG-165), not a segment nested under
              the task list — files are a peer of tasks, not a child of them.
              Only renders when a release is scoped (assets is release-scoped,
              see /api/releases/{id}/assets). */}
          {FILES_ENABLED && scopedRelease ? (
            <Link
              href={`/dashboard/releases/${scopedRelease.id}/files`}
              className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Files
            </Link>
          ) : null}
          {/* Press kit link (URG-198): same shape as Calendar/Files above —
              the workspace is where users land, so every release surface
              gets its entry point here. */}
          {EPK_ENABLED && scopedRelease ? (
            <Link
              href={`/dashboard/releases/${scopedRelease.id}/epk`}
              className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover"
            >
              <Newspaper className="h-3.5 w-3.5" aria-hidden="true" />
              Press kit
              {/* Beta stamp, same tag as Calendar above — the press kit
                  generator shipped 2026-07-31 and is still early. */}
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                Beta
              </span>
            </Link>
          ) : null}
          {extraActions}
        </div>
      </div>

      <div className="space-y-3">
        {/* Every bucket empty: the buckets below have all suppressed
            themselves, so leave one quiet line instead of a blank panel. */}
        {sectionOrder.every((sectionKey) => sections[sectionKey].length === 0) ? (
          <p className="px-1 py-4 text-xs text-content-tertiary">
            {scopedRelease ? 'No activities for this release yet.' : 'No activities yet.'}
          </p>
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
    </aside>
  );
}
