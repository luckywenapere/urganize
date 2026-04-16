'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { EmptyState } from '@/components/shared/EmptyState';
import { SectionCard } from '@/components/shared/SectionCard';
import { Toast } from '@/components/shared/Toast';
import { ReleaseWorkspaceTabs } from '@/components/releases/ReleaseWorkspaceTabs';
import { TaskCard } from '@/components/tasks/TaskCard';
import { TaskRow } from '@/components/tasks/TaskRow';
import { TASKS_CHANGED_EVENT, useTaskUI } from '@/components/tasks/TaskUIProvider';
import { captureAnalyticsEvent } from '@/lib/analytics';
import { ONBOARDING_TASK_CREATED_EVENT } from '@/lib/onboarding';
import { sortTasksByPosition, type ReleaseTasksResponse, type Task, type TaskGroup, type TaskViewMode } from '@/lib/tasks';
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
          <Link href={`/dashboard/releases/${releaseId}`} className="inline-flex min-h-10 items-center text-sm text-content-secondary hover:text-content-primary">
            Back to release
          </Link>
        </div>

        {toast ? <div className="mb-4"><Toast message={toast.message} tone={toast.tone} /></div> : null}
        {error ? <div className="mb-4"><Toast message={error} tone="error" /></div> : null}

        {data ? (
          <div className="space-y-6">
            <SectionCard className="sm:p-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-content-tertiary">Release Tasks</p>
                  <h1 className="mt-2 text-[clamp(2rem,4vw,3rem)] tracking-tight text-content-primary">
                    {data.release.title}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm text-content-secondary">
                    Keep release work sequenced across the rollout.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="inline-flex rounded-[18px] border border-stroke-default bg-bg-elevated p-1">
                    {(['kanban', 'list'] as TaskViewMode[]).map((mode) => (
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
                        className={`min-h-10 rounded-[14px] px-4 py-2 text-sm font-semibold ${
                          viewMode === mode ? 'bg-bg-surface text-content-primary' : 'text-content-secondary'
                        }`}
                      >
                        {mode === 'kanban' ? 'Kanban' : 'List'}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => openQuickCreate({ releaseId, source: onboardingTaskMode ? 'onboarding' : 'inline' })}
                    className="min-h-11 rounded-[18px] bg-brand px-5 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                  >
                    New task
                  </button>
                </div>
              </div>

              <div className="mt-6">
                <ReleaseWorkspaceTabs releaseId={releaseId} />
              </div>
            </SectionCard>

            {viewMode === 'kanban' ? (
              <div className="grid gap-5 lg:grid-cols-[repeat(3,minmax(0,1fr))_280px]">
                {grouped.map(({ group, tasks }) => (
                  <SectionCard
                    key={group.id}
                    data-onboarding-target={group.id === firstGroupId ? 'release-first-task-group' : undefined}
                    className="flex min-h-[420px] flex-col rounded-[28px] p-4"
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
                    <div className="flex items-start justify-between gap-3">
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
                            <p className="text-sm font-semibold text-content-primary">{group.name}</p>
                            <p className="mt-1 text-xs text-content-secondary">{tasks.length} task(s)</p>
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
                          className="rounded-full border border-stroke-default px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteGroup(group.id)}
                          className="rounded-full border border-status-error/35 bg-status-error/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-status-error"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex-1 space-y-3">
                      {inlineComposerGroupId === group.id ? (
                        <div
                          data-onboarding-target="release-task-inline-row"
                          className="rounded-[22px] border border-brand/25 bg-brand/8 p-3"
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
                                className="min-h-10 rounded-[16px] bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                              >
                                {isInlineSaving ? 'Saving...' : 'Save task'}
                              </button>
                              {!onboardingTaskMode ? (
                                <button
                                  type="button"
                                  onClick={resetInlineComposer}
                                  className="min-h-10 rounded-[16px] border border-stroke-default px-4 py-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                                >
                                  Cancel
                                </button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {tasks.length === 0 ? (
                        <EmptyState
                          title="No tasks here yet"
                          description="Add a task or drag one in."
                          action={
                            <button
                              type="button"
                              onClick={() => {
                                setInlineComposerGroupId(group.id);
                                setInlineComposerTitle('');
                              }}
                              className="min-h-10 rounded-[16px] bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                            >
                              Add task
                            </button>
                          }
                        />
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
                      className="mt-4 min-h-11 rounded-[18px] border border-dashed border-stroke-default px-4 py-3 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    >
                      Add task
                    </button>
                  </SectionCard>
                ))}

                <SectionCard className="rounded-[28px] p-4">
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
                          className="min-h-11 rounded-[16px] bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCreatingGroup(false);
                            setNewGroupName('');
                          }}
                          className="min-h-11 rounded-[16px] border border-stroke-default px-4 py-3 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreatingGroup(true)}
                      className="flex min-h-[220px] w-full items-center justify-center rounded-[22px] border border-dashed border-stroke-default bg-bg-elevated/30 px-4 py-6 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                    >
                      + Add Group
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
                            : `${tasks.length} task(s) currently in this phase.`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setInlineComposerGroupId(group.id);
                          setInlineComposerTitle('');
                        }}
                        className="rounded-full border border-stroke-default bg-bg-elevated px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-content-secondary hover:bg-bg-hover hover:text-content-primary"
                      >
                        + Add
                      </button>
                    </div>

                    {inlineComposerGroupId === group.id ? (
                      <div
                        data-onboarding-target="release-task-inline-row"
                        className="border-b border-stroke-subtle bg-brand/6 px-5 py-4"
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
                            className="min-h-12 rounded-[18px] bg-brand px-4 py-3 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
                          >
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
