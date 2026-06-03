'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
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
import { TaskRow } from '@/components/tasks/TaskRow';
import { useTaskUI } from '@/components/tasks/TaskUIProvider';
import { useTaskStore } from '@/stores/useTaskStore';
import { ScopePill } from './ScopePill';

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

// Default expanded state on first render: Overdue and Catch Up open (both
// flag "look here first"), everything else collapsed. Done stays collapsed
// — the count alone communicates progress; expanding is for un-ticking a
// mistake.
const DEFAULT_EXPANDED: Record<TaskSectionKey, boolean> = {
  overdue: true,
  catch_up: true,
  today: false,
  week: false,
  upcoming: false,
  no_due_date: false,
  done: false,
};

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
  // The TaskUIProvider mounted in AppShell already renders TaskDetailDrawer
  // globally; the workspace just needs to call openTask(taskId) on row click
  // to surface it. Restores the per-task drawer (Title, Status, Priority,
  // Assignee, Due, Release, Group, Description, Comments, per-task
  // Attachments via task_attachments table — distinct from the per-release
  // FilesPanel/assets table).
  const { openTask } = useTaskUI();
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

  // Per-bucket open/closed state, persisted for the session.
  const [expanded, setExpanded] = useState<Record<TaskSectionKey, boolean>>(DEFAULT_EXPANDED);

  // Detect scope-id transitions during render so we can auto-expand any bucket
  // that has scoped matches — otherwise the user clicks a release and the
  // results land behind a collapsed header. This is the documented "Adjusting
  // state when a prop changes" pattern from React's docs (setState during
  // render, conditional, converges in one extra render). The undefined sentinel
  // means the auto-expand also fires on first mount when an initial scope is
  // present in the URL.
  const [prevScopeId, setPrevScopeId] = useState<string | null | undefined>(undefined);
  const currentScopeId = scopedRelease?.id ?? null;
  if (prevScopeId !== currentScopeId) {
    setPrevScopeId(currentScopeId);
    if (scopedRelease) {
      setExpanded((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const key of sectionOrder) {
          // Done stays collapsed even when it has matches — it's terminal,
          // and a release with completed tasks shouldn't open a tall list of
          // strikethrough rows ahead of the active work.
          if (key === 'done') continue;
          if (sections[key].length > 0 && !next[key]) {
            next[key] = true;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }

  const toggleBucket = (key: TaskSectionKey) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
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
        {/* ScopePill is desktop-only. Below lg the mobile drill-down model
            in WorkspaceView replaces it with a dedicated back+title header
            above this panel — the pill's "showing tasks for X / × clear"
            affordance is redundant when drilling IS the scope and the back
            control IS the clear. */}
        <div className="hidden lg:block">
          <ScopePill release={scopedRelease} onClear={onClearScope} />
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
