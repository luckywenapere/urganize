'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  getTaskPriorityLabel,
  getTaskSectionDescription,
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
import { ScopePill } from './ScopePill';

const sectionOrder: TaskSectionKey[] = ['overdue', 'today', 'week', 'upcoming', 'no_due_date'];

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

  return (
    <aside id={id} className="space-y-3 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Tasks
        </h2>
        <ScopePill release={scopedRelease} onClear={onClearScope} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-content-tertiary">
            Priority
          </span>
          <select
            value={priorityFilter}
            onChange={(event) => syncFilter({ priority: event.target.value })}
            className="input h-10 w-full"
          >
            <option value="">All priorities</option>
            {TASK_PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>
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
            className="input h-10 w-full"
          >
            <option value="">All statuses</option>
            {TASK_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {getTaskStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-3">
        {sectionOrder.map((sectionKey) => {
          const sectionTasks = sections[sectionKey];
          return (
            <div key={sectionKey} className="border border-stroke-default bg-bg-surface">
              <div className="border-b border-stroke-subtle px-4 py-3">
                <p
                  className={`text-sm font-semibold ${
                    sectionKey === 'overdue' ? 'text-status-error' : 'text-content-primary'
                  }`}
                >
                  {getTaskSectionLabel(sectionKey)}
                  <span className="ml-2 font-normal text-content-tertiary">
                    ({sectionTasks.length})
                  </span>
                </p>
              </div>
              {sectionTasks.length === 0 ? (
                <div className="px-4 py-5">
                  <p className="text-xs text-content-tertiary">
                    {getTaskSectionDescription(sectionKey)}
                  </p>
                </div>
              ) : (
                <div>
                  {sectionTasks.map((task) => (
                    <TaskRow key={task.id} task={task} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
