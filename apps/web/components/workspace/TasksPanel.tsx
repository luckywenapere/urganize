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
import { ScopePill } from './ScopePill';

const sectionOrder: TaskSectionKey[] = ['overdue', 'today', 'week', 'upcoming', 'no_due_date'];

// Default expanded state on first render: Overdue open, everything else
// collapsed. Keeps the panel short so the user sees the most urgent bucket
// up top and can expand other contexts on demand.
const DEFAULT_EXPANDED: Record<TaskSectionKey, boolean> = {
  overdue: true,
  today: false,
  week: false,
  upcoming: false,
  no_due_date: false,
};

// Per-bucket empty-state copy. The unscoped copy is celebratory ("You're
// caught up"); the scoped copy is factual because a single release with no
// overdue items is the expected state, not an achievement.
const UNSCOPED_EMPTY: Record<TaskSectionKey, string> = {
  overdue: "You're caught up.",
  today: 'Nothing due today.',
  week: 'Nothing due this week.',
  upcoming: 'Nothing queued yet.',
  no_due_date: 'No unscheduled tasks.',
};

const SCOPED_EMPTY: Record<TaskSectionKey, string> = {
  overdue: 'No overdue tasks for this release.',
  today: 'Nothing due today for this release.',
  week: 'Nothing due this week for this release.',
  upcoming: 'Nothing upcoming for this release.',
  no_due_date: 'No unscheduled tasks for this release.',
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

  const sections = useMemo(() => groupTasksIntoSections(filteredTasks), [filteredTasks]);

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
    <aside id={id} className="space-y-3 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Tasks
        </h2>
        <ScopePill release={scopedRelease} onClear={onClearScope} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
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
          Caveats noted in the response: Safari/macOS may still render the
          popup in light mode for "fully native" selects regardless.
        */}
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-content-tertiary">
            Priority
          </span>
          <select
            value={priorityFilter}
            onChange={(event) => syncFilter({ priority: event.target.value })}
            className="h-10 w-full rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm text-content-primary transition-colors [color-scheme:dark] hover:border-stroke-strong focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-content-tertiary">
            Status
          </span>
          <select
            value={statusFilter}
            onChange={(event) => syncFilter({ status: event.target.value })}
            className="h-10 w-full rounded-lg border border-stroke-default bg-bg-surface px-3 text-sm text-content-primary transition-colors [color-scheme:dark] hover:border-stroke-strong focus:border-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
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
        </label>
      </div>

      <div className="space-y-3">
        {sectionOrder.map((sectionKey) => {
          const sectionTasks = sections[sectionKey];
          const isOpen = expanded[sectionKey];
          const bodyId = `workspace-bucket-${sectionKey}`;
          return (
            <div key={sectionKey} className="border border-stroke-default bg-bg-surface">
              <button
                type="button"
                onClick={() => toggleBucket(sectionKey)}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${
                  isOpen ? 'border-b border-stroke-subtle' : ''
                }`}
              >
                <span
                  className={`text-sm font-semibold ${
                    sectionKey === 'overdue' ? 'text-status-error' : 'text-content-primary'
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
                    sectionTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        density="compact"
                        onClick={(t) => openTask(t.id)}
                      />
                    ))
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
