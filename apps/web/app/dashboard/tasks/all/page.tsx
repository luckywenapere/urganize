'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionCard } from '@/components/shared/SectionCard';
import { Toast } from '@/components/shared/Toast';
import { TaskRow } from '@/components/tasks/TaskRow';
import { TASKS_CHANGED_EVENT, useTaskUI } from '@/components/tasks/TaskUIProvider';
import { type PreSaveReleaseOption } from '@/lib/pre-save';
import {
  getTaskPriorityLabel,
  getTaskStatusLabel,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_OPTIONS,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type WorkspaceMember,
} from '@/lib/tasks';
import { supabase } from '@/lib/supabase/client';

type AllTasksPayload = {
  grouped?: Array<{
    release: { id: string; title: string; artistName: string } | null;
    tasks: Task[];
  }>;
  error?: string;
};

type ReleaseSelectorPayload = {
  releases?: PreSaveReleaseOption[];
};

type WorkspaceMembersPayload = {
  members?: WorkspaceMember[];
};

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

function AllTasksLoadingState() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, groupIndex) => (
        <SectionCard key={groupIndex} className="overflow-hidden px-0 py-0">
          <div className="border-b border-stroke-subtle px-5 py-5">
            <div className="h-4 w-32 rounded-full skeleton-shimmer" />
            <div className="mt-3 h-3 w-40 rounded-full skeleton-shimmer" />
          </div>
          <div className="space-y-3 px-5 py-5">
            {Array.from({ length: 3 }).map((__, rowIndex) => (
              <div
                key={rowIndex}
                className="flex min-h-[72px] items-center gap-4 rounded-[22px] border border-stroke-subtle bg-bg-surface px-4 py-3"
              >
                <div className="h-5 w-5 rounded-[6px] skeleton-shimmer" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-3.5 w-2/5 rounded-full skeleton-shimmer" />
                  <div className="h-3 w-1/3 rounded-full skeleton-shimmer" />
                </div>
                <div className="h-8 w-20 rounded-full skeleton-shimmer" />
              </div>
            ))}
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

export default function AllTasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openTask, openQuickCreate } = useTaskUI();
  const [grouped, setGrouped] = useState<AllTasksPayload['grouped']>([]);
  const [releases, setReleases] = useState<PreSaveReleaseOption[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<TaskStatus>('todo');
  const [bulkPriority, setBulkPriority] = useState<TaskPriority>('medium');
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  const releaseFilter = searchParams.get('release') || '';
  const priorityFilter = (searchParams.get('priority') || '') as TaskPriority | '';
  const statusFilter = (searchParams.get('status') || '') as TaskStatus | '';
  const sortFilter = searchParams.get('sort') || 'due_date';

  const syncFilter = (next: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    router.replace(`/dashboard/tasks/all${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const loadPage = async () => {
    setIsLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const [tasksResponse, releasesResponse, membersResponse] = await Promise.all([
        fetch(`/api/tasks/all${searchParams.toString() ? `?${searchParams.toString()}` : ''}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        }),
        fetch('/api/releases?view=selector', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        }),
        fetch('/api/workspace/members', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        }),
      ]);

      const tasksPayload = (await tasksResponse.json().catch(() => ({}))) as AllTasksPayload;
      const releasesPayload = (await releasesResponse.json().catch(() => ({}))) as ReleaseSelectorPayload;
      const membersPayload = (await membersResponse.json().catch(() => ({}))) as WorkspaceMembersPayload;

      if (!tasksResponse.ok) {
        throw new Error(tasksPayload.error || 'Could not load workspace tasks.');
      }

      setGrouped(Array.isArray(tasksPayload.grouped) ? tasksPayload.grouped : []);
      setReleases(Array.isArray(releasesPayload.releases) ? releasesPayload.releases : []);
      setMembers(Array.isArray(membersPayload.members) ? membersPayload.members : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load workspace tasks.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  useEffect(() => {
    const handleTasksChanged = () => {
      void loadPage();
    };

    window.addEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
    return () => window.removeEventListener(TASKS_CHANGED_EVENT, handleTasksChanged);
  });

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const allTasks = useMemo(() => grouped?.flatMap((group) => group.tasks) || [], [grouped]);

  const runBulkAction = async (action: 'status' | 'priority' | 'assignee' | 'delete') => {
    if (!selectedIds.length) {
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      if (action === 'delete' && !window.confirm('Delete the selected tasks?')) {
        return;
      }

      await Promise.all(
        selectedIds.map(async (taskId) => {
          if (action === 'delete') {
            await fetch(`/api/tasks/${taskId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            return;
          }

          const body =
            action === 'status'
              ? { status: bulkStatus }
              : action === 'priority'
                ? { priority: bulkPriority }
                : { assignedTo: bulkAssignee || null };

          await fetch(`/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          });
        })
      );

      setSelectedIds([]);
      setToast({ tone: 'success', message: 'Bulk action applied.' });
      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    } catch (bulkError) {
      setToast({
        tone: 'error',
        message: bulkError instanceof Error ? bulkError.message : 'Could not update the selected tasks.',
      });
    }
  };

  return (
    <main className="min-h-screen bg-bg-base text-content-primary" data-ph-capture-attribute-section="tasks">
      <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-16 sm:px-6 sm:py-10">
        {toast ? <div className="mb-4"><Toast message={toast.message} tone={toast.tone} /></div> : null}
        {error ? <div className="mb-4"><Toast message={error} tone="error" /></div> : null}

        <SectionCard className="sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">All tasks</p>
              <h1 className="mt-2 text-[clamp(2rem,4vw,3rem)] tracking-tight text-content-primary">
                Workspace tasks
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-content-secondary">
                Review every release and make bulk updates.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push('/dashboard/tasks')}
                className="min-h-11 rounded-[18px] border border-stroke-default bg-bg-elevated px-5 py-3 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
              >
                Mine
              </button>
              <button
                type="button"
                onClick={() => openQuickCreate({ source: 'quick_create' })}
                className="min-h-11 rounded-[18px] bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
              >
                New task
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_180px]">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Release
              </span>
              <select
                value={releaseFilter}
                onChange={(event) => syncFilter({ release: event.target.value })}
                className="input h-12 rounded-[18px]"
              >
                <option value="">All releases</option>
                {releases.map((release) => (
                  <option key={release.id} value={release.id}>
                    {release.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Priority
              </span>
              <select
                value={priorityFilter}
                onChange={(event) => syncFilter({ priority: event.target.value })}
                className="input h-12 rounded-[18px]"
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
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Status
              </span>
              <select
                value={statusFilter}
                onChange={(event) => syncFilter({ status: event.target.value })}
                className="input h-12 rounded-[18px]"
              >
                <option value="">All statuses</option>
                {TASK_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {getTaskStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                Sort by
              </span>
              <select
                value={sortFilter}
                onChange={(event) => syncFilter({ sort: event.target.value })}
                className="input h-12 rounded-[18px]"
              >
                <option value="due_date">Due date</option>
                <option value="priority">Priority</option>
                <option value="assignee">Assignee</option>
                <option value="status">Status</option>
                <option value="created_at">Created date</option>
              </select>
            </label>
          </div>
        </SectionCard>

        {selectedIds.length > 0 ? (
          <SectionCard className="mt-5 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <p className="text-sm font-semibold text-content-primary">{selectedIds.length} selected</p>
              <div className="grid flex-1 gap-3 lg:grid-cols-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                    Reassign
                  </span>
                  <select
                    value={bulkAssignee}
                    onChange={(event) => setBulkAssignee(event.target.value)}
                    className="input h-11 rounded-[16px]"
                  >
                    <option value="">Unassigned</option>
                    {members.filter((member) => member.status === 'active').map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                    Status
                  </span>
                  <select
                    value={bulkStatus}
                    onChange={(event) => setBulkStatus(event.target.value as TaskStatus)}
                    className="input h-11 rounded-[16px]"
                  >
                    {TASK_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {getTaskStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-content-tertiary">
                    Priority
                  </span>
                  <select
                    value={bulkPriority}
                    onChange={(event) => setBulkPriority(event.target.value as TaskPriority)}
                    className="input h-11 rounded-[16px]"
                  >
                    {TASK_PRIORITY_OPTIONS.map((priority) => (
                      <option key={priority} value={priority}>
                        {getTaskPriorityLabel(priority)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void runBulkAction('assignee')}
                    className="min-h-11 rounded-[16px] border border-stroke-default bg-bg-elevated px-3 py-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  >
                    Assign
                  </button>
                  <button
                    type="button"
                    onClick={() => void runBulkAction('status')}
                    className="min-h-11 rounded-[16px] border border-stroke-default bg-bg-elevated px-3 py-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  >
                    Status
                  </button>
                  <button
                    type="button"
                    onClick={() => void runBulkAction('priority')}
                    className="min-h-11 rounded-[16px] border border-stroke-default bg-bg-elevated px-3 py-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                  >
                    Priority
                  </button>
                  <button
                    type="button"
                    onClick={() => void runBulkAction('delete')}
                    className="min-h-11 rounded-[16px] border border-status-error/35 bg-status-error/10 px-3 py-2 text-sm font-semibold text-status-error"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </SectionCard>
        ) : null}

        <div className="mt-6 space-y-5">
          {isLoading ? (
            <AllTasksLoadingState />
          ) : allTasks.length === 0 ? (
            <EmptyState
              title="No tasks match these filters"
              description="Try different filters or add a task."
              action={
                <button
                  type="button"
                  onClick={() => openQuickCreate({ source: 'quick_create' })}
                  className="min-h-11 rounded-[18px] bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                >
                  New task
                </button>
              }
            />
          ) : (
            grouped?.map((group) => (
              <SectionCard key={group.release?.id || 'no-release'} className="overflow-hidden px-0 py-0">
                <div className="border-b border-stroke-subtle px-5 py-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-content-primary">
                        {group.release?.title || 'No release'}
                      </p>
                      <p className="mt-2 text-sm text-content-secondary">
                        {group.release
                          ? `${group.release.artistName || 'Artist'} tasks`
                          : 'Standalone tasks not tied to a release.'}
                      </p>
                    </div>
                    <span className="inline-flex min-h-10 items-center rounded-full border border-stroke-default bg-bg-elevated px-3 text-xs font-semibold uppercase tracking-[0.12em] text-content-secondary">
                      {group.tasks.length} task{group.tasks.length === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    showCheckbox
                    selected={selectedIds.includes(task.id)}
                    onSelectedChange={(checked) => {
                      setSelectedIds((current) =>
                        checked ? Array.from(new Set([...current, task.id])) : current.filter((id) => id !== task.id)
                      );
                    }}
                    onClick={(nextTask) => openTask(nextTask.id)}
                  />
                ))}
              </SectionCard>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
