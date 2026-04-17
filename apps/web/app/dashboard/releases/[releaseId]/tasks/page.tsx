'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Columns3,
  Edit3,
  LayoutList,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionCard } from '@/components/shared/SectionCard';
import { Toast } from '@/components/shared/Toast';
import { ReleaseWorkspaceTabs } from '@/components/releases/ReleaseWorkspaceTabs';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskRow } from '@/components/tasks/TaskRow';
import { TASKS_CHANGED_EVENT, useTaskUI } from '@/components/tasks/TaskUIProvider';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { ONBOARDING_TASK_CREATED_EVENT } from '@/lib/onboarding';
import {
  getRelativeDueLabel,
  sortTasksByPosition,
  type ReleaseTasksResponse,
  type Task,
  type TaskGroup,
  type TaskViewMode,
} from '@/lib/tasks';
import { supabase } from '@/lib/supabase/client';

type ToastState = {
  message: string;
  tone: 'success' | 'error';
};

const VIEW_MODE_STORAGE_KEY = 'urganize.release-tasks.view-mode';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

function groupTasks(tasks: Task[], groups: TaskGroup[]): Array<{ group: TaskGroup; tasks: Task[] }> {
  return groups.map((group) => ({
    group,
    tasks: sortTasksByPosition(tasks.filter((task) => task.groupId === group.id)),
  }));
}

function getReleaseTaskStats(tasks: Task[]) {
  const completedTasks = tasks.filter((task) => task.status === 'done').length;
  const activeTasks = tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled').length;
  const overdueTasks = tasks.filter((task) => getRelativeDueLabel(task).isOverdue).length;
  const assignedTasks = tasks.filter((task) => Boolean(task.assignee)).length;
  const completionPercent = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return {
    activeTasks,
    assignedTasks,
    completedTasks,
    completionPercent,
    overdueTasks,
    totalTasks: tasks.length,
  };
}

function getGroupAccentClass(index: number): string {
  const accents = [
    'from-phase-preproduction/20 via-white/[0.035] to-transparent',
    'from-phase-promotion/20 via-white/[0.035] to-transparent',
    'from-brand/20 via-white/[0.035] to-transparent',
    'from-status-info/20 via-white/[0.035] to-transparent',
  ];

  return accents[index % accents.length];
}

function buildReorderedTasks(
  tasks: Task[],
  groups: TaskGroup[],
  draggedTaskId: string,
  targetGroupId: string,
  targetTaskId?: string
) {
  const tasksByGroup = new Map<string, Task[]>();
  for (const group of groups) {
    tasksByGroup.set(group.id, sortTasksByPosition(tasks.filter((task) => task.groupId === group.id)));
  }

  const draggedTask = tasks.find((task) => task.id === draggedTaskId);
  if (!draggedTask) {
    return tasks;
  }

  const sourceTasks = tasksByGroup.get(draggedTask.groupId || '') || [];
  const nextSourceTasks = sourceTasks.filter((task) => task.id !== draggedTaskId);
  tasksByGroup.set(draggedTask.groupId || '', nextSourceTasks);

  const targetTasks = tasksByGroup.get(targetGroupId) || [];
  const insertIndex =
    targetTaskId && targetTasks.findIndex((task) => task.id === targetTaskId) >= 0
      ? targetTasks.findIndex((task) => task.id === targetTaskId)
      : targetTasks.length;

  const nextTargetTasks = [...targetTasks];
  nextTargetTasks.splice(insertIndex, 0, {
    ...draggedTask,
    groupId: targetGroupId,
    group: groups.find((group) => group.id === targetGroupId) || null,
  });
  tasksByGroup.set(targetGroupId, nextTargetTasks);

  return groups.flatMap((group) =>
    (tasksByGroup.get(group.id) || []).map((task, index) => ({
      ...task,
      groupId: group.id,
      group,
      position: index,
    }))
  );
}

export default function ReleaseTasksPage() {
  const params = useParams<{ releaseId: string }>();
  const searchParams = useSearchParams();
  const releaseId = Array.isArray(params?.releaseId) ? params.releaseId[0] : params?.releaseId || '';
  const { openTask, openQuickCreate } = useTaskUI();
  const [data, setData] = useState<ReleaseTasksResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [viewMode, setViewMode] = useState<TaskViewMode>('kanban');
  const [draggedTaskId, setDraggedTaskId] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState('');
  const [editingGroupName, setEditingGroupName] = useState('');
  const [inlineComposerGroupId, setInlineComposerGroupId] = useState('');
  const [inlineComposerTitle, setInlineComposerTitle] = useState('');
  const [isInlineSaving, setIsInlineSaving] = useState(false);
  const onboardingTaskMode = searchParams.get('onboarding') === 'task';

  const loadBoard = async () => {
    if (!releaseId) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/releases/${releaseId}/tasks`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: 'no-store',
      });

      const payload = (await response.json().catch(() => ({}))) as ReleaseTasksResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not load release tasks.');
      }

      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load release tasks.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadBoard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseId]);

  useEffect(() => {
    const storedViewMode = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (storedViewMode === 'list' || storedViewMode === 'kanban') {
      setViewMode(storedViewMode);
    }
  }, []);

  useEffect(() => {
    const handleTasksChanged = () => {
      void loadBoard();
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

  const grouped = useMemo(
    () => (data ? groupTasks(data.tasks, data.groups) : []),
    [data]
  );
  const stats = useMemo(() => getReleaseTaskStats(data?.tasks || []), [data?.tasks]);
  const firstGroupId = data?.groups[0]?.id || '';

  useEffect(() => {
    if (!onboardingTaskMode || !firstGroupId || inlineComposerGroupId) {
      return;
    }

    setInlineComposerGroupId(firstGroupId);
  }, [firstGroupId, inlineComposerGroupId, onboardingTaskMode]);

  const resetInlineComposer = () => {
    if (onboardingTaskMode) {
      setInlineComposerTitle('');
      return;
    }

    setInlineComposerGroupId('');
    setInlineComposerTitle('');
  };

  const createInlineTask = async () => {
    if (!inlineComposerGroupId || !inlineComposerTitle.trim()) {
      return;
    }

    try {
      setIsInlineSaving(true);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: inlineComposerTitle.trim(),
          releaseId,
          groupId: inlineComposerGroupId,
          source: onboardingTaskMode ? 'onboarding' : 'inline',
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        task?: { id?: string; title?: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not create task.');
      }

      setToast({ tone: 'success', message: 'Task created.' });
      const createdTaskId = String(payload.task?.id || '').trim();
      const createdTaskTitle = String(payload.task?.title || inlineComposerTitle.trim()).trim();
      resetInlineComposer();

      if (onboardingTaskMode && createdTaskId) {
        window.dispatchEvent(
          new CustomEvent(ONBOARDING_TASK_CREATED_EVENT, {
            detail: {
              releaseId,
              taskId: createdTaskId,
              title: createdTaskTitle,
            },
          })
        );
      }

      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    } catch (createError) {
      setToast({
        tone: 'error',
        message: createError instanceof Error ? createError.message : 'Could not create task.',
      });
    } finally {
      setIsInlineSaving(false);
    }
  };

  const persistReorder = async (nextTasks: Task[]) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      setData((current) => (current ? { ...current, tasks: nextTasks } : current));

      const response = await fetch('/api/tasks/reorder', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tasks: nextTasks.map((task) => ({
            id: task.id,
            groupId: task.groupId,
            position: task.position,
          })),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not reorder tasks.');
      }

      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    } catch (reorderError) {
      setToast({
        tone: 'error',
        message: reorderError instanceof Error ? reorderError.message : 'Could not reorder tasks.',
      });
      void loadBoard();
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) {
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/releases/${releaseId}/task-groups`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not create task group.');
      }

      setCreatingGroup(false);
      setNewGroupName('');
      setToast({ tone: 'success', message: 'Group created.' });
      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    } catch (groupError) {
      setToast({
        tone: 'error',
        message: groupError instanceof Error ? groupError.message : 'Could not create task group.',
      });
    }
  };

  const renameGroup = async (groupId: string, name: string) => {
    if (!name.trim()) {
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const response = await fetch(`/api/releases/${releaseId}/task-groups/${groupId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not rename task group.');
      }

      setEditingGroupId('');
      setEditingGroupName('');
      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    } catch (renameError) {
      setToast({
        tone: 'error',
        message: renameError instanceof Error ? renameError.message : 'Could not rename task group.',
      });
    }
  };

  const deleteGroup = async (groupId: string) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      let confirmDelete = false;
      const firstResponse = await fetch(`/api/releases/${releaseId}/task-groups/${groupId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirm: false }),
      });

      if (firstResponse.status === 409) {
        const conflictPayload = (await firstResponse.json().catch(() => ({}))) as { taskCount?: number; error?: string };
        confirmDelete = window.confirm(
          `This group still has ${conflictPayload.taskCount || 0} task(s). Move them and delete the group?`
        );
        if (!confirmDelete) {
          return;
        }
      } else if (!firstResponse.ok) {
        const payload = (await firstResponse.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || 'Could not delete task group.');
      } else {
        window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
        return;
      }

      const response = await fetch(`/api/releases/${releaseId}/task-groups/${groupId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirm: confirmDelete }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not delete task group.');
      }

      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    } catch (deleteError) {
      setToast({
        tone: 'error',
        message: deleteError instanceof Error ? deleteError.message : 'Could not delete task group.',
      });
    }
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-bg-base px-4 pb-24 pt-16 text-content-primary sm:px-6 sm:py-10">
        <SectionCard className="space-y-4 sm:p-7">
          <div className="h-4 w-32 rounded-full skeleton-shimmer" />
          <div className="h-10 w-2/5 rounded-[18px] skeleton-shimmer" />
          <div className="h-4 w-3/5 rounded-full skeleton-shimmer" />
        </SectionCard>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg-base text-content-primary" data-ph-capture-attribute-section="tasks">
      <div className="mx-auto max-w-[1380px] px-4 pb-24 pt-16 sm:px-6 sm:py-10">
        <div className="mb-4">
          <Link
            href={`/dashboard/releases/${releaseId}`}
            className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-content-secondary transition hover:text-content-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to release
          </Link>
        </div>

        {toast ? <div className="mb-4"><Toast message={toast.message} tone={toast.tone} /></div> : null}
        {error ? <div className="mb-4"><Toast message={error} tone="error" /></div> : null}

        {data ? (
          <div className="space-y-6">
            <SectionCard className="relative overflow-hidden sm:p-0">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_20%_0%,rgba(62,207,142,0.18),transparent_38%),linear-gradient(90deg,rgba(118,124,255,0.08),transparent)]" />

              <div className="relative p-5 sm:p-7">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-brand">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                      Release tasks
                    </div>
                    <h1 className="mt-4 text-[clamp(2.15rem,4vw,3.25rem)] tracking-tight text-content-primary">
                      {data.release.title}
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-content-secondary">
                      Sequence rollout work, assign owners, and move every release task from prep to post-launch without losing the thread.
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-stroke-default bg-bg-base/70 p-1">
                      {(['kanban', 'list'] as TaskViewMode[]).map((mode) => {
                        const Icon = mode === 'kanban' ? Columns3 : LayoutList;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => {
                              setViewMode(mode);
                              window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
                              captureAnalyticsEvent({
                                name: 'task_view_switched',
                                properties: { view: mode },
                              });
                            }}
                            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition ${
                              viewMode === mode
                                ? 'bg-bg-surface text-content-primary shadow-[0_10px_24px_-18px_rgba(0,0,0,0.75)]'
                                : 'text-content-secondary hover:bg-bg-hover hover:text-content-primary'
                            }`}
                            aria-pressed={viewMode === mode}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {mode === 'kanban' ? 'Kanban' : 'List'}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => openQuickCreate({ releaseId, source: onboardingTaskMode ? 'onboarding' : 'inline' })}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-content-inverse transition hover:bg-brand-hover hover:shadow-glow-sm"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      New task
                    </button>
                  </div>
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Active', value: stats.activeTasks, helper: `${stats.totalTasks} total` },
                    { label: 'Completed', value: stats.completedTasks, helper: `${stats.completionPercent}% done` },
                    { label: 'Assigned', value: stats.assignedTasks, helper: `${data.members.length} team members` },
                    { label: 'Overdue', value: stats.overdueTasks, helper: stats.overdueTasks ? 'Needs attention' : 'Clear' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-stroke-subtle bg-bg-elevated/55 p-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-content-tertiary">
                        {item.label}
                      </p>
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <p className="text-2xl font-semibold tracking-tight text-content-primary">{item.value}</p>
                        <p className="text-right text-xs text-content-secondary">{item.helper}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-bg-base">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand via-status-info to-phase-preproduction transition-all duration-slower"
                    style={{ width: `${stats.completionPercent}%` }}
                  />
                </div>

                <div className="mt-6">
                  <ReleaseWorkspaceTabs releaseId={releaseId} />
                </div>
              </div>
            </SectionCard>

            {viewMode === 'kanban' ? (
              <div className="grid gap-4 xl:grid-cols-[repeat(3,minmax(280px,1fr))_260px]">
                {grouped.map(({ group, tasks }, index) => (
                  <SectionCard
                    key={group.id}
                    data-onboarding-target={group.id === firstGroupId ? 'release-first-task-group' : undefined}
                    className="relative flex min-h-[460px] flex-col rounded-xl p-0"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (!draggedTaskId || !data) {
                        return;
                      }

                      const reordered = buildReorderedTasks(data.tasks, data.groups, draggedTaskId, group.id);
                      void persistReorder(reordered);
                      setDraggedTaskId('');
                    }}
                  >
                    <div className={`h-1.5 bg-gradient-to-r ${getGroupAccentClass(index)}`} />
                    <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
                      <div className="min-w-0 flex-1">
                        {editingGroupId === group.id ? (
                          <input
                            value={editingGroupName}
                            onChange={(event) => setEditingGroupName(event.target.value)}
                            onBlur={() => void renameGroup(group.id, editingGroupName)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void renameGroup(group.id, editingGroupName);
                              }

                              if (event.key === 'Escape') {
                                setEditingGroupId('');
                                setEditingGroupName('');
                              }
                            }}
                            className="input h-11 rounded-[16px]"
                            autoFocus
                          />
                        ) : (
                          <>
                            <p className="truncate text-sm font-semibold text-content-primary">{group.name}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-stroke-default bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-content-secondary">
                                {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                              </span>
                              {tasks.some((task) => getRelativeDueLabel(task).isOverdue) ? (
                                <span className="rounded-full border border-status-error/25 bg-status-error/10 px-2 py-0.5 text-xs font-semibold text-status-error">
                                  Overdue
                                </span>
                              ) : null}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingGroupId(group.id);
                            setEditingGroupName(group.name);
                          }}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-stroke-default text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
                          aria-label={`Rename ${group.name}`}
                          title="Rename group"
                        >
                          <Edit3 className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteGroup(group.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-status-error/30 bg-status-error/10 text-status-error transition hover:bg-status-error/15"
                          aria-label={`Delete ${group.name}`}
                          title="Delete group"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 space-y-3 px-4 pb-4">
                      {inlineComposerGroupId === group.id ? (
                        <div
                          data-onboarding-target="release-task-inline-row"
                          className="rounded-xl border border-brand/25 bg-brand/10 p-3 shadow-[0_16px_32px_-28px_rgba(62,207,142,0.7)]"
                        >
                          <div className="flex flex-col gap-3">
                            <input
                              value={inlineComposerTitle}
                              onChange={(event) => setInlineComposerTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void createInlineTask();
                                }

                                if (event.key === 'Escape' && !onboardingTaskMode) {
                                  resetInlineComposer();
                                }
                              }}
                              className="input h-12 rounded-[18px]"
                              placeholder="Add a task and hit Enter"
                              autoFocus
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void createInlineTask()}
                                disabled={isInlineSaving}
                                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                              >
                                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                {isInlineSaving ? 'Saving...' : 'Save task'}
                              </button>
                              {!onboardingTaskMode ? (
                                <button
                                  type="button"
                                  onClick={resetInlineComposer}
                                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stroke-default px-4 py-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                                >
                                  <X className="h-4 w-4" aria-hidden="true" />
                                  Cancel
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {tasks.length === 0 ? (
                        <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-dashed border-stroke-default bg-bg-elevated/35 px-5 py-8 text-center">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-brand/20 bg-brand/10 text-brand">
                            <Plus className="h-5 w-5" aria-hidden="true" />
                          </div>
                          <p className="mt-4 text-sm font-semibold text-content-primary">No tasks here yet</p>
                          <p className="mt-2 max-w-[220px] text-sm leading-6 text-content-secondary">
                            Start this phase with one concrete next move, or drag a task into the column.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setInlineComposerGroupId(group.id);
                              setInlineComposerTitle('');
                            }}
                            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Add task
                          </button>
                        </div>
                      ) : (
                        tasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            draggable
                            onClick={(nextTask) => openTask(nextTask.id)}
                            onDragStart={(nextTask) => setDraggedTaskId(nextTask.id)}
                            onDrop={(targetTask) => {
                              if (!draggedTaskId || !data) {
                                return;
                              }

                              const reordered = buildReorderedTasks(
                                data.tasks,
                                data.groups,
                                draggedTaskId,
                                group.id,
                                targetTask.id
                              );
                              void persistReorder(reordered);
                              setDraggedTaskId('');
                            }}
                          />
                        ))
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setInlineComposerGroupId(group.id);
                        setInlineComposerTitle('');
                      }}
                      className="mx-4 mb-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-dashed border-stroke-default px-4 py-3 text-sm font-semibold text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add task
                    </button>
                  </SectionCard>
                ))}

                <SectionCard className="rounded-xl p-4">
                  {creatingGroup ? (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-content-primary">Add Group</p>
                      <input
                        value={newGroupName}
                        onChange={(event) => setNewGroupName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void createGroup();
                          }

                          if (event.key === 'Escape') {
                            setCreatingGroup(false);
                            setNewGroupName('');
                          }
                        }}
                        className="input h-12 rounded-[18px]"
                        placeholder="Post-Release PR"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void createGroup()}
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingGroup(false);
                            setNewGroupName('');
                          }}
                          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stroke-default px-4 py-3 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreatingGroup(true)}
                      className="flex min-h-[220px] w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-stroke-default bg-bg-elevated/30 px-4 py-6 text-sm font-semibold text-content-secondary transition hover:bg-bg-hover hover:text-content-primary"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-stroke-default bg-bg-surface text-content-primary">
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </span>
                      Add group
                    </button>
                  )}
                </SectionCard>
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map(({ group, tasks }) => (
                  <SectionCard key={group.id} className="overflow-hidden px-0 py-0">
                    <div className="flex items-start justify-between gap-3 border-b border-stroke-subtle px-5 py-5">
                      <div>
                        <p className="text-lg font-semibold text-content-primary">{group.name}</p>
                        <p className="mt-2 text-sm text-content-secondary">
                          {tasks.length === 0
                            ? 'Nothing has landed here yet.'
                            : `${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} currently in this phase.`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setInlineComposerGroupId(group.id);
                          setInlineComposerTitle('');
                        }}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-stroke-default bg-bg-elevated px-3 py-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Add
                      </button>
                    </div>

                    {inlineComposerGroupId === group.id ? (
                      <div
                        data-onboarding-target="release-task-inline-row"
                        className="border-b border-stroke-subtle bg-brand/10 px-5 py-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <input
                            value={inlineComposerTitle}
                            onChange={(event) => setInlineComposerTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void createInlineTask();
                              }

                              if (event.key === 'Escape' && !onboardingTaskMode) {
                                resetInlineComposer();
                              }
                            }}
                            className="input h-12 flex-1 rounded-[18px]"
                            placeholder="Add a task and hit Enter"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => void createInlineTask()}
                            disabled={isInlineSaving}
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            {isInlineSaving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {tasks.length === 0 ? (
                      <div className="px-5 py-5">
                        <EmptyState
                          title="Nothing in this group"
                          description="Tasks here help the whole team understand what belongs in this release phase."
                        />
                      </div>
                    ) : (
                      tasks.map((task) => (
                        <TaskRow key={task.id} task={task} onClick={(nextTask) => openTask(nextTask.id)} />
                      ))
                    )}
                  </SectionCard>
                ))}
              </div>
            )}
          </div>
        ) : (
          <SectionCard>
            <EmptyState
              title="Release tasks are not ready yet"
              description="We could not load this release board. Try refreshing or creating the task tables first."
            />
          </SectionCard>
        )}
      </div>
    </main>
  );
}
