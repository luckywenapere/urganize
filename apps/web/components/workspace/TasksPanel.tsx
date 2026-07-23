'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ChevronDown, FolderOpen, Plus } from 'lucide-react';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  getTaskPriorityLabel,
  getTaskSectionLabel,
  getTaskStatusLabel,
  groupTasksIntoSections,
  type Task,
  type TaskPriority,
  type TaskSectionKey,
  type TaskStatus,
} from '@/lib/tasks';
import type { Release } from '@/types/releases';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { useTaskStore } from '@/stores/useTaskStore';
import { ScopePill } from './ScopePill';

// Content calendar entry point (URG-157): the workspace is the surface users
// actually land on after login, so the scoped-release header carries the
// calendar affordance alongside Files rather than hiding it on the release
// detail page alone.
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';

// Files entry point (URG-182): same flag gates the assets API routes and the
// release detail page's Asset section.
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';

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

// Per-bucket empty-state copy. The unscoped copy is celebratory ("You're
// caught up"); the scoped copy is factual because a single release with no
// overdue items is the expected state, not an achievement. Done has no
// "scoped" variant worth distinguishing — an empty Done is just "no tasks
// completed yet" either way.
const UNSCOPED_EMPTY: Record<TaskSectionKey, string> = {
  overdue: "You're caught up.",
  catch_up: 'No catch-up tasks.',
  today: 'Nothing due today.',
  week: 'Nothing due this week.',
  upcoming: 'Nothing queued yet.',
  no_due_date: 'No unscheduled tasks.',
  done: 'No tasks completed yet.',
};

const SCOPED_EMPTY: Record<TaskSectionKey, string> = {
  overdue: 'No overdue tasks for this release.',
  catch_up: 'No catch-up tasks for this release.',
  today: 'Nothing due today for this release.',
  week: 'Nothing due this week for this release.',
  upcoming: 'Nothing upcoming for this release.',
  no_due_date: 'No unscheduled tasks for this release.',
  done: 'Nothing completed for this release yet.',
};

type TasksPanelProps = {
  /** Tasks already filtered by `?release=` scope (handled in parent). */
  tasks: Task[];
  /** Pill display data; null when no scope is set. */
  scopedRelease: Pick<Release, 'id' | 'title' | 'artistName'> | null;
  onClearScope: () => void;
  /** Optional DOM id, used by the parent to smooth-scroll into view when the
   * layout is stacked (below lg) and a release card is tapped. */
  id?: string;
};

export function TasksPanel({ tasks, scopedRelease, onClearScope, id }: TasksPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  // openTask flips the TaskUIProvider into "task open" state, which causes
  // WorkspaceDesktopFocused (or the mobile drill-down in WorkspaceView) to
  // swap this panel for TaskDetailInline in the same surface. No drawer /
  // overlay — the center column itself becomes the task detail.
  const { openTask, openQuickCreate } = useTaskUI();
  const searchParams = useSearchParams();

  const priorityFilter = (searchParams.get('priority') || '') as TaskPriority | '';
  const statusFilter = (searchParams.get('status') || '') as TaskStatus | '';

  // Mirrors the syncFilter pattern in app/dashboard/tasks/page.tsx so the
  // ?priority= / ?status= params are written the same way and remain
  // round-trippable with that page until it's retired.
  const syncFilter = useCallback(
    (next: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(next).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      const query = params.toString();
      router.replace(`${pathname ?? ''}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (priorityFilter && task.priority !== priorityFilter) return false;
      if (statusFilter && task.status !== statusFilter) return false;
      return true;
    });
  }, [tasks, priorityFilter, statusFilter]);

  // Pending-completion override: just-ticked tasks keep their original
  // time-based bucket for ~1.5s before sliding into Done. The store owns
  // the timer; the panel just reads the override so render output matches
  // the in-place beat.
  const pendingCompletionIds = useTaskStore((state) => state.pendingCompletionIds);

  const sections = useMemo(
    () => groupTasksIntoSections(filteredTasks, pendingCompletionIds),
    [filteredTasks, pendingCompletionIds]
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Tasks
        </h2>
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
            New task
          </button>
          {/* Files link: its own page (URG-165), not a segment nested under
              the task list — files are a peer of tasks, not a child of them.
              Only renders when a release is scoped (assets is release-scoped,
              see /api/releases/{id}/assets). */}
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
              {/* Beta stamp (2026-07-23): the content calendar ships as Beta —
                  same tag on the calendar page's header and the release detail
                  entry link. */}
              <span className="rounded-full bg-brand/15 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-brand">
                Beta
              </span>
            </Link>
          ) : null}
          {FILES_ENABLED && scopedRelease ? (
            <Link
              href={`/dashboard/releases/${scopedRelease.id}/files`}
              className="motion-focus motion-press inline-flex h-8 items-center gap-1.5 rounded-full border border-stroke-default bg-bg-surface px-3 text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Files
            </Link>
          ) : null}
          {/* ScopePill is desktop-only. Below lg the mobile drill-down model
              in WorkspaceView replaces it with a dedicated back+title header
              above this panel — the pill's "showing tasks for X / × clear"
              affordance is redundant when drilling IS the scope and the back
              control IS the clear. */}
          <div className="hidden lg:block">
            <ScopePill release={scopedRelease} onClear={onClearScope} />
          </div>
        </div>
      </div>

      {/*
        Native <select> dropdowns: the open option-list popup is rendered by
        the OS/browser, not the page DOM. We drop the global `.input` class
        (which uses a near-transparent white bg that some browsers read as a
        light surface and then paint a light popup over) in favour of:
          - solid dark surface tokens on the closed select
          - `[color-scheme:dark]` directly on the element so the open popup
            is painted in dark even if the page-level `color-scheme: dark`
            isn't inherited reliably for form controls
          - explicit `bg-bg-surface text-content-primary` on each <option> as
            a fallback for browsers that honor option styling
        Caveats: Safari/macOS may still render the popup in light mode for
        "fully native" selects regardless.

        The "PRIORITY" / "STATUS" eyebrow labels above each select were
        removed — the default option ("All priorities" / "All statuses")
        already communicates the filter's purpose, and the eyebrows broke
        the panel's `space-y-3` rhythm. `aria-label` was moved onto each
        <select> so screen readers still announce what the control does.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          value={priorityFilter}
          onChange={(event) => syncFilter({ priority: event.target.value })}
          aria-label="Filter tasks by priority"
          className="motion-focus h-10 w-full rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm text-content-primary transition-colors [color-scheme:dark] hover:border-stroke-strong focus:border-brand"
        >
          <option value="" className="bg-bg-surface text-content-primary">
            All priorities
          </option>
          {TASK_PRIORITY_OPTIONS.map((priority) => (
            <option key={priority} value={priority} className="bg-bg-surface text-content-primary">
              {getTaskPriorityLabel(priority)}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(event) => syncFilter({ status: event.target.value })}
          aria-label="Filter tasks by status"
          className="motion-focus h-10 w-full rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm text-content-primary transition-colors [color-scheme:dark] hover:border-stroke-strong focus:border-brand"
        >
          <option value="" className="bg-bg-surface text-content-primary">
            All statuses
          </option>
          {TASK_STATUS_OPTIONS.map((status) => (
            <option key={status} value={status} className="bg-bg-surface text-content-primary">
              {getTaskStatusLabel(status)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {sectionOrder.map((sectionKey) => {
          const sectionTasks = sections[sectionKey];
          const isOpen = expanded[sectionKey];
          const isDoneBucket = sectionKey === 'done';
          // Done is suppressed entirely when empty — the count alone is the
          // signal, and a 0-count Done bucket adds noise to the bottom of
          // the panel without earning its space. Every other bucket still
          // renders so the user can see "Overdue (0)" as proof they're
          // caught up.
          if (isDoneBucket && sectionTasks.length === 0) return null;
          const bodyId = `workspace-bucket-${sectionKey}`;
          return (
            <div
              key={sectionKey}
              className={`border border-stroke-default ${
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
                  {sectionTasks.length === 0 ? (
                    <div className="px-4 py-5">
                      <p className="text-xs text-content-tertiary">
                        {scopedRelease ? SCOPED_EMPTY[sectionKey] : UNSCOPED_EMPTY[sectionKey]}
                      </p>
                    </div>
                  ) : (
                    sectionTasks.map((task) => {
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
                    })
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
