'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { TaskDetailDrawer } from '@/components/tasks/TaskDetailDrawer';
import { type DependencyTaskSummary } from '@/components/tasks/TaskDependenciesSection';
import { TaskQuickCreateModal } from '@/components/tasks/TaskQuickCreateModal';
import { type ReleaseOption } from '@/lib/release-helpers';
import { isTypingTarget, type TaskCreateSource, type TaskDetail, type TaskGroup, type TaskPriority, type WorkspaceMember } from '@/lib/tasks';
import { useTaskStore } from '@/stores/useTaskStore';
import { supabase } from '@/lib/supabase/client';

type TaskDetailPayload = {
  task?: TaskDetail;
  error?: string;
};

type WorkspaceMembersPayload = {
  members?: WorkspaceMember[];
  error?: string;
};

type ReleaseSelectorPayload = {
  releases?: ReleaseOption[];
  error?: string;
};

type ReleaseTasksPayload = {
  groups?: TaskGroup[];
  error?: string;
};

type QuickCreateDefaults = {
  releaseId?: string | null;
  groupId?: string | null;
  source?: TaskCreateSource;
};

type TaskUIContextValue = {
  openTask: (taskId: string) => void;
  openQuickCreate: (defaults?: QuickCreateDefaults) => void;
  closeTask: () => void;
};

const TaskUIContext = createContext<TaskUIContextValue | null>(null);
export const TASKS_CHANGED_EVENT = 'urganize:tasks-changed';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Session expired. Please sign in again.');
  }

  const response = await fetch(input, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(payload.error || 'Request failed.'));
  }

  return payload as T;
}

function dispatchTasksChanged() {
  window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
}

function toReleaseQuery(release: ReleaseOption | null): string {
  return release?.title || '';
}

function toAssigneeQuery(member: WorkspaceMember | null): string {
  return member?.name || '';
}

export function useTaskUI() {
  const context = useContext(TaskUIContext);
  if (!context) {
    throw new Error('useTaskUI must be used inside TaskUIProvider.');
  }

  return context;
}

export function TaskUIProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activeTaskId, setActiveTaskId] = useState('');
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [drawerError, setDrawerError] = useState('');
  // Inline message surfaced next to the drawer's status select when the user
  // attempts to mark a blocked task done. Cleared on the next successful patch
  // or when the drawer reopens.
  const [statusBlockerMessage, setStatusBlockerMessage] = useState('');
  // Prerequisite tasks resolved from the active task's dependency IDs, sourced
  // from the task store. Only release-detail navigation hydrates the store
  // today, so cross-release entries (Tasks page) may render an empty section.
  const storeTasks = useTaskStore((state) => state.tasks);
  // True while the augmented detail (comments, attachments, activity) is
  // being fetched. Drives section-level spinners in the drawer. The drawer
  // body itself renders as soon as `task` is non-null (hydrated from the
  // store), so this flag no longer gates the whole drawer — only the
  // augmented sections that aren't in the list-state task.
  const [isTaskLoading, setIsTaskLoading] = useState(false);
  const [isTaskGroupsLoading, setIsTaskGroupsLoading] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateDefaults, setQuickCreateDefaults] = useState<QuickCreateDefaults>({});
  const [quickTitle, setQuickTitle] = useState('');
  const [quickReleaseQuery, setQuickReleaseQuery] = useState('');
  const [quickSelectedRelease, setQuickSelectedRelease] = useState<ReleaseOption | null>(null);
  const [quickAssigneeQuery, setQuickAssigneeQuery] = useState('');
  const [quickSelectedAssignee, setQuickSelectedAssignee] = useState<WorkspaceMember | null>(null);
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>('none');
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [releases, setReleases] = useState<ReleaseOption[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [, setIsOptionsLoaded] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

  const shouldShowTaskShell = pathname?.startsWith('/dashboard') || pathname === '/settings';

  // Monotonically increasing sequence number for task patches. Each
  // `saveTaskPatch` call claims the next value; when its async response
  // returns, it only writes the returned task to local state if no newer
  // patch has been issued since. This drops out-of-order responses so rapid,
  // overlapping field edits can't clobber each other with a stale snapshot.
  const patchVersionRef = useRef(0);

  const loadingOptionsRef = useRef(false);
  const loadOptions = useCallback(async () => {
    if (loadingOptionsRef.current) {
      return;
    }

    loadingOptionsRef.current = true;
    setIsLoadingOptions(true);
    try {
      const [releasePayload, membersPayload] = await Promise.all([
        requestJson<ReleaseSelectorPayload>('/api/releases?view=selector'),
        requestJson<WorkspaceMembersPayload>('/api/workspace/members'),
      ]);

      setReleases(Array.isArray(releasePayload.releases) ? releasePayload.releases : []);
      setMembers(Array.isArray(membersPayload.members) ? membersPayload.members : []);
      setIsOptionsLoaded(true);
    } finally {
      loadingOptionsRef.current = false;
      setIsLoadingOptions(false);
    }
  }, []);

  const loadTaskGroups = useCallback(async (releaseId: string | null | undefined) => {
    if (!releaseId) {
      setTaskGroups([]);
      setIsTaskGroupsLoading(false);
      return;
    }

    setIsTaskGroupsLoading(true);
    try {
      const payload = await requestJson<ReleaseTasksPayload>(`/api/releases/${releaseId}/tasks`);
      setTaskGroups(Array.isArray(payload.groups) ? payload.groups : []);
    } catch (error) {
      console.error('Failed to load task groups:', error);
    } finally {
      setIsTaskGroupsLoading(false);
    }
  }, []);

  // Augmented fetch only — `task` is already hydrated optimistically from the
  // store by `openTask`. This fills in comments, attachments, and activity,
  // and refreshes any core fields that may have changed on the server.
  // Non-blocking: loadOptions and loadTaskGroups run in parallel, not in
  // series. The body never waits on them.
  const loadTask = useCallback(
    async (taskId: string) => {
      if (!taskId) {
        return;
      }

      setIsTaskLoading(true);

      try {
        const payload = await requestJson<TaskDetailPayload>(`/api/tasks/${taskId}`);
        if (!payload.task) {
          throw new Error('Task not found.');
        }

        setTask(payload.task);
        setDrawerError('');

        // Kick off groups in background — does not block the body.
        if (payload.task.releaseId) {
          void loadTaskGroups(payload.task.releaseId);
        } else {
          setTaskGroups([]);
        }
      } catch (error) {
        console.error('Failed to load task detail:', error);
        // If the drawer already has hydrated content from the store, keep
        // it visible and just log. Only surface the error when we have
        // nothing to show.
        setTask((current) => {
          if (current && current.id === taskId) {
            return current;
          }
          setDrawerError(error instanceof Error ? error.message : 'Could not load task.');
          return current;
        });
      } finally {
        setIsTaskLoading(false);
      }
    },
    [loadTaskGroups]
  );

  useEffect(() => {
    if (!activeTaskId || !isTaskDrawerOpen) {
      return;
    }

    // Both fetches run in parallel — neither blocks the body, which renders
    // immediately from the store-hydrated task.
    void loadOptions();
    void loadTask(activeTaskId);
  }, [activeTaskId, isTaskDrawerOpen, loadOptions, loadTask]);

  useEffect(() => {
    if (!shouldShowTaskShell) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      if (event.key.toLowerCase() === 'c') {
        event.preventDefault();
        setQuickCreateDefaults({});
        setIsQuickCreateOpen(true);
        void loadOptions();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loadOptions, shouldShowTaskShell]);

  useEffect(() => {
    if (!isQuickCreateOpen || !quickCreateDefaults.releaseId || !releases.length) {
      return;
    }

    const nextRelease = releases.find((release) => release.id === quickCreateDefaults.releaseId) || null;
    setQuickSelectedRelease(nextRelease);
    setQuickReleaseQuery(toReleaseQuery(nextRelease));
  }, [isQuickCreateOpen, quickCreateDefaults.releaseId, releases]);

  const resetQuickCreate = () => {
    setQuickTitle('');
    setQuickReleaseQuery('');
    setQuickSelectedRelease(null);
    setQuickAssigneeQuery('');
    setQuickSelectedAssignee(null);
    setQuickDueDate('');
    setQuickPriority('none');
    setQuickCreateDefaults({});
  };

  const openTask = useCallback(
    (taskId: string) => {
      setActiveTaskId(taskId);
      setIsTaskDrawerOpen(true);
      setDrawerError('');
      setStatusBlockerMessage('');

      // Hydrate the drawer instantly from the list-state task. The store's
      // ExecutionTask carries every core field the drawer body needs (title,
      // description, status, priority, due date, assignee, releaseId,
      // dependencies). The augmented detail (comments, attachments, activity)
      // arrives later via loadTask and is merged into this seed.
      //
      // If the task isn't in the store (e.g., opened via notification), we
      // fall back to null and the body renders the full skeleton until the
      // fetch completes.
      const storeTask = useTaskStore.getState().tasks.find((t) => t.id === taskId);
      if (storeTask) {
        setTask({
          ...storeTask,
          comments: [],
          attachments: [],
          activity: [],
        } as TaskDetail);
      } else {
        setTask(null);
      }
    },
    []
  );

  const closeTask = useCallback(() => {
    setIsTaskDrawerOpen(false);
    setDrawerError('');
    setStatusBlockerMessage('');
    // Clear the active task so the next open starts fresh — no flash of the
    // previous task's data while the new fetch is in flight.
    setActiveTaskId('');
    setTask(null);
    setTaskGroups([]);
  }, []);

  const openQuickCreate = useCallback(
    (defaults?: QuickCreateDefaults) => {
      setQuickCreateDefaults(defaults || {});
      setIsQuickCreateOpen(true);
      void loadOptions();
    },
    [loadOptions]
  );

  const closeQuickCreate = () => {
    setIsQuickCreateOpen(false);
    resetQuickCreate();
  };

  const refreshOpenTask = async () => {
    if (!activeTaskId) {
      return;
    }

    await loadTask(activeTaskId);
  };

  const saveTaskPatch = async (patch: {
    title?: string;
    description?: string | null;
    status?: string;
    priority?: TaskPriority;
    dueDate?: string | null;
    assignedToUserId?: string | null;
    releaseId?: string | null;
    groupId?: string | null;
  }) => {
    if (!activeTaskId) {
      return;
    }

    // Claim this patch's place in the issue order. Any state write below only
    // lands if no newer patch has been issued by the time the response
    // returns — see `patchVersionRef`.
    const patchVersion = ++patchVersionRef.current;
    const isLatestPatch = () => patchVersion === patchVersionRef.current;

    // Route status→done through the store so the dependency blocker check
    // and the cascade-unlock both run. The store self-hydrates if the task
    // isn't loaded yet (cross-release entries from notifications or the
    // flat Tasks page), so the same path covers every entry point.
    if (patch.status === 'done') {
      const completed = await useTaskStore.getState().completeTask(activeTaskId);
      if (!isLatestPatch()) {
        return;
      }
      if (!completed) {
        const blocker = useTaskStore.getState().error;
        setStatusBlockerMessage(blocker || 'Could not complete task.');
        return;
      }
      setStatusBlockerMessage('');
      await refreshOpenTask();
      dispatchTasksChanged();
      return;
    }

    try {
      const payload = await requestJson<TaskDetailPayload>(`/api/tasks/${activeTaskId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...patch,
          dueDate: patch.dueDate ? new Date(patch.dueDate).toISOString() : patch.dueDate,
        }),
      });

      if (payload.task) {
        // A newer patch superseded this one — discard this stale snapshot.
        // The newer patch's response (and its own list refresh) will carry
        // the authoritative state, so we skip every write here.
        if (!isLatestPatch()) {
          return;
        }
        setTask(payload.task);
        setDrawerError('');
        setStatusBlockerMessage('');
        await loadTaskGroups(payload.task.releaseId);
        dispatchTasksChanged();
        }
    } catch (error) {
      // Surface the failure in the drawer so the user knows their change
      // didn't persist. Re-fetch the task to revert any visual drift.
      const message = error instanceof Error ? error.message : 'Could not save changes.';
      console.error('Task patch failed:', error);
      if (!isLatestPatch()) {
        return;
      }
      setDrawerError(`Failed to save changes: ${message}`);
      if (activeTaskId) {
        try {
          const refreshed = await requestJson<TaskDetailPayload>(`/api/tasks/${activeTaskId}`, {
            method: 'GET',
          });
          if (refreshed.task && isLatestPatch()) {
            setTask(refreshed.task);
          }
        } catch (refreshError) {
          console.error('Task refetch after failed patch also failed:', refreshError);
        }
      }
    }
  };

  const createQuickTask = async () => {
    if (!quickTitle.trim()) {
      return;
    }

    setIsQuickSaving(true);
    try {
      const payload = await requestJson<TaskDetailPayload>(`/api/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: quickTitle.trim(),
          releaseId: quickSelectedRelease?.id || quickCreateDefaults.releaseId || null,
          groupId: quickCreateDefaults.groupId || null,
          assignedToUserId: quickSelectedAssignee?.userId || null,
          dueDate: quickDueDate ? new Date(quickDueDate).toISOString() : null,
          priority: quickPriority,
          source: quickCreateDefaults.source || 'quick_create',
        }),
      });

      closeQuickCreate();
      dispatchTasksChanged();

      if (payload.task?.id) {
        openTask(payload.task.id);
      }
    } finally {
      setIsQuickSaving(false);
    }
  };

  const deleteTask = async () => {
    if (!activeTaskId) {
      return;
    }

    await requestJson<{ ok: boolean }>(`/api/tasks/${activeTaskId}`, {
      method: 'DELETE',
    });

    closeTask();
    setTask(null);
    dispatchTasksChanged();
  };

  const addComment = async (content: string) => {
    if (!activeTaskId || !content.trim()) {
      return;
    }

    await requestJson<{ comments: TaskDetail['comments'] }>(`/api/tasks/${activeTaskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });

    await refreshOpenTask();
    dispatchTasksChanged();
  };

  const updateComment = async (commentId: string, content: string) => {
    if (!activeTaskId || !commentId || !content.trim()) {
      return;
    }

    await requestJson<{ comments: TaskDetail['comments'] }>(`/api/tasks/${activeTaskId}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    });

    await refreshOpenTask();
  };

  const deleteComment = async (commentId: string) => {
    if (!activeTaskId || !commentId) {
      return;
    }

    await requestJson<{ comments: TaskDetail['comments'] }>(`/api/tasks/${activeTaskId}/comments/${commentId}`, {
      method: 'DELETE',
    });

    await refreshOpenTask();
  };

  const uploadAttachment = async (file: File) => {
    if (!activeTaskId) {
      return;
    }

    setIsUploadingAttachment(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error('Session expired. Please sign in again.');
      }

      const formData = new FormData();
      formData.set('file', file);

      const response = await fetch(`/api/tasks/${activeTaskId}/attachments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Could not upload attachment.');
      }

      await refreshOpenTask();
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    if (!activeTaskId) {
      return;
    }

    await requestJson<{ attachments: TaskDetail['attachments'] }>(`/api/tasks/${activeTaskId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });

    await refreshOpenTask();
  };

  const contextValue = useMemo<TaskUIContextValue>(
    () => ({
      openTask,
      openQuickCreate,
      closeTask,
    }),
    [closeTask, openQuickCreate, openTask]
  );

  const prerequisites = useMemo<DependencyTaskSummary[]>(() => {
    const ids = task?.dependencies || [];
    if (ids.length === 0) {
      return [];
    }

    const idSet = new Set(ids);
    return storeTasks
      .filter((candidate) => idSet.has(candidate.id))
      .map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        status: candidate.status,
        dueDate: candidate.dueDate,
      }));
  }, [storeTasks, task?.dependencies]);

  return (
    <TaskUIContext.Provider value={contextValue}>
      {children}

      <TaskQuickCreateModal
        isOpen={isQuickCreateOpen}
        title={quickTitle}
        releaseQuery={quickReleaseQuery}
        selectedRelease={quickSelectedRelease}
        assigneeQuery={quickAssigneeQuery}
        selectedAssignee={quickSelectedAssignee}
        dueDate={quickDueDate}
        priority={quickPriority}
        releases={releases}
        members={members}
        isLoadingReleases={isLoadingOptions}
        isSaving={isQuickSaving}
        onClose={closeQuickCreate}
        onTitleChange={setQuickTitle}
        onReleaseQueryChange={setQuickReleaseQuery}
        onSelectRelease={(release) => {
          setQuickSelectedRelease(release);
          setQuickReleaseQuery(toReleaseQuery(release));
        }}
        onAssigneeQueryChange={setQuickAssigneeQuery}
        onSelectAssignee={(member) => {
          setQuickSelectedAssignee(member);
          setQuickAssigneeQuery(toAssigneeQuery(member));
        }}
        onDueDateChange={setQuickDueDate}
        onPriorityChange={setQuickPriority}
        onSubmit={createQuickTask}
      />

      <TaskDetailDrawer
        isOpen={isTaskDrawerOpen}
        isLoading={isTaskLoading}
        isLoadingMembers={isLoadingOptions}
        isLoadingGroups={isTaskGroupsLoading}
        error={drawerError}
        task={task}
        members={members}
        releases={releases}
        groups={taskGroups}
        isUploadingAttachment={isUploadingAttachment}
        prerequisites={prerequisites}
        statusBlockerMessage={statusBlockerMessage}
        onOpenPrerequisite={openTask}
        onClose={closeTask}
        onSavePatch={saveTaskPatch}
        onDeleteTask={deleteTask}
        onAddComment={addComment}
        onUpdateComment={updateComment}
        onDeleteComment={deleteComment}
        onUploadAttachment={uploadAttachment}
        onDeleteAttachment={deleteAttachment}
      />
    </TaskUIContext.Provider>
  );
}
