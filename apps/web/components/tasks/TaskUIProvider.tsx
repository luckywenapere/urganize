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
import { TaskDetailView, type TaskDetailPatchInput } from '@/components/tasks/TaskDetailView';
import { type DependencyTaskSummary } from '@/components/tasks/TaskDependenciesSection';
import { TaskQuickCreateModal } from '@/components/tasks/TaskQuickCreateModal';
import { UndoCompletionToast } from '@/components/tasks/UndoCompletionToast';
import { type ReleaseOption } from '@/lib/release-helpers';
import { isTypingTarget, type TaskCreateSource, type TaskDetail, type TaskPriority, type WorkspaceMember } from '@/lib/tasks';
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

type QuickCreateDefaults = {
  releaseId?: string | null;
  groupId?: string | null;
  source?: TaskCreateSource;
};

type TaskUIContextValue = {
  openTask: (taskId: string) => void;
  openQuickCreate: (defaults?: QuickCreateDefaults) => void;
  closeTask: () => void;
  /** True while a task detail is open. Consumers use this to swap their
   * main-area content from "list" to TaskDetailInline. There is no drawer /
   * overlay anywhere — every entry point (workspace row click, notification
   * bell, release detail page) renders the inline view in place. */
  isTaskOpen: boolean;
};

const TaskUIContext = createContext<TaskUIContextValue | null>(null);

/**
 * Internal render context — carries the per-task render state + callbacks so
 * `<TaskDetailInline />` can mount the in-place view from any consumer
 * (workspace center column, release detail page) without each consumer having
 * to wire up the ~15 props the detail body needs. The state still lives in
 * TaskUIProvider's closure; this context is just the conduit.
 */
type TaskDetailRenderState = {
  isOpen: boolean;
  isLoading: boolean;
  isLoadingMembers: boolean;
  error: string;
  task: TaskDetail | null;
  members: WorkspaceMember[];
  isUploadingAttachment: boolean;
  prerequisites: DependencyTaskSummary[];
  statusBlockerMessage: string;
  onBack: () => void;
  onSavePatch: (patch: TaskDetailPatchInput) => Promise<void>;
  onOpenPrerequisite: (taskId: string) => void;
  onDeleteTask: () => Promise<void>;
  onAddComment: (content: string) => Promise<boolean>;
  onUpdateComment: (commentId: string, content: string) => Promise<boolean>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onUploadAttachment: (file: File) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
};

const TaskDetailRenderContext = createContext<TaskDetailRenderState | null>(null);

export const TASKS_CHANGED_EVENT = 'urganize:tasks-changed';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

// Hard ceiling on every provider mutation. The modals disable their
// dismissal controls while a request is in flight, so a request that never
// settles must not be able to trap the user — a stalled fetch aborts here
// and surfaces as a normal, dismissible error instead.
const REQUEST_TIMEOUT_MS = 20_000;

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Session expired. Please sign in again.');
  }

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new Error('The request timed out. Check your connection and try again.');
    }
    throw error;
  }

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
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateDefaults, setQuickCreateDefaults] = useState<QuickCreateDefaults>({});
  const [quickTitle, setQuickTitle] = useState('');
  const [quickReleaseQuery, setQuickReleaseQuery] = useState('');
  const [quickSelectedRelease, setQuickSelectedRelease] = useState<ReleaseOption | null>(null);
  const [quickAssigneeQuery, setQuickAssigneeQuery] = useState('');
  const [quickSelectedAssignee, setQuickSelectedAssignee] = useState<WorkspaceMember | null>(null);
  const [quickDueDate, setQuickDueDate] = useState('');
  const [quickGroupName, setQuickGroupName] = useState<string | null>(null);
  const [quickGroupColor, setQuickGroupColor] = useState<string | null>(null);
  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState('');
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
        // The ?view=selector param died 2026-07-10 — GET /api/releases now
        // returns the selector payload unconditionally.
        requestJson<ReleaseSelectorPayload>('/api/releases'),
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

  // Augmented fetch only — `task` is already hydrated optimistically from the
  // store by `openTask`. This fills in comments, attachments, and activity,
  // and refreshes any core fields that may have changed on the server. The
  // body never blocks on it.
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
    []
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
    setQuickGroupName(null);
    setQuickGroupColor(null);
    setQuickCreateDefaults({});
    setQuickError('');
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
  }, []);

  const openQuickCreate = useCallback(
    (defaults?: QuickCreateDefaults) => {
      setQuickCreateDefaults(defaults || {});
      // A failure from a previous session's in-flight create can land after
      // the modal closed — never show that stale message over a fresh form.
      setQuickError('');
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
    groupName?: string | null;
    groupColor?: string | null;
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
        // Empty error means the store IGNORED the click (a duplicate while
        // the previous complete/reopen was still in flight) — that's a
        // no-op, not a failure, so no banner.
        const blocker = useTaskStore.getState().error;
        setStatusBlockerMessage(blocker);
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
    const trimmedTitle = quickTitle.trim();
    const releaseId = quickSelectedRelease?.id || quickCreateDefaults.releaseId || null;
    if (!trimmedTitle || !releaseId) {
      // The submit button is also disabled when these are missing; this is the
      // belt-and-braces guard against an Enter-key path that bypasses the
      // disabled state.
      return;
    }

    setIsQuickSaving(true);
    setQuickError('');
    try {
      const payload = await requestJson<TaskDetailPayload>(`/api/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title: trimmedTitle,
          releaseId,
          groupId: quickCreateDefaults.groupId || null,
          assignedToUserId: quickSelectedAssignee?.userId || null,
          dueDate: quickDueDate ? new Date(quickDueDate).toISOString() : null,
          // Manually-created tasks are NOT compressed_runway — that flag is
          // template-only (set by lib/release-templates/instantiate.ts when
          // the computed offset lands before the release date). Past-due
          // manual tasks are genuine overdue, not catch-up. The server
          // mapper reads metadata.template.compressed_runway and defaults to
          // false when absent, which is the path we want here.
          autoGenerated: false,
          groupName: quickGroupName,
          groupColor: quickGroupColor,
          source: quickCreateDefaults.source || 'quick_create',
        }),
      });

      closeQuickCreate();
      dispatchTasksChanged();

      if (payload.task?.id) {
        openTask(payload.task.id);
      }
    } catch (error) {
      // Keep the modal open with inputs intact and say what went wrong — this
      // used to fail with zero feedback (try/finally, no catch), the primary
      // task-creation flow silently doing nothing on a 4xx/5xx/network error.
      setQuickError(
        error instanceof Error ? error.message : 'Could not create task. Try again.'
      );
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

  // Comment/attachment mutations report success so the view can decide what
  // local state is safe to discard (the comment draft, the edit box). They
  // used to throw with no catch — a failed save silently swallowed the text
  // the user typed, and a failed delete left the row on screen with no
  // explanation. Failures now land in the drawer error banner.
  const addComment = async (content: string): Promise<boolean> => {
    if (!activeTaskId || !content.trim()) {
      return false;
    }

    try {
      await requestJson<{ comments: TaskDetail['comments'] }>(`/api/tasks/${activeTaskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      setDrawerError(error instanceof Error ? error.message : 'Could not add comment.');
      return false;
    }

    await refreshOpenTask();
    dispatchTasksChanged();
    return true;
  };

  const updateComment = async (commentId: string, content: string): Promise<boolean> => {
    if (!activeTaskId || !commentId || !content.trim()) {
      return false;
    }

    try {
      await requestJson<{ comments: TaskDetail['comments'] }>(`/api/tasks/${activeTaskId}/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ content }),
      });
    } catch (error) {
      setDrawerError(error instanceof Error ? error.message : 'Could not save the comment edit.');
      return false;
    }

    await refreshOpenTask();
    return true;
  };

  const deleteComment = async (commentId: string) => {
    if (!activeTaskId || !commentId) {
      return;
    }

    try {
      await requestJson<{ comments: TaskDetail['comments'] }>(`/api/tasks/${activeTaskId}/comments/${commentId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      setDrawerError(error instanceof Error ? error.message : 'Could not delete the comment.');
      return;
    }

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
    } catch (error) {
      setDrawerError(
        error instanceof Error ? error.message : 'Could not upload attachment.'
      );
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    if (!activeTaskId) {
      return;
    }

    try {
      await requestJson<{ attachments: TaskDetail['attachments'] }>(`/api/tasks/${activeTaskId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      setDrawerError(error instanceof Error ? error.message : 'Could not delete the attachment.');
      return;
    }

    await refreshOpenTask();
  };

  const contextValue = useMemo<TaskUIContextValue>(
    () => ({
      openTask,
      openQuickCreate,
      closeTask,
      isTaskOpen: isTaskDrawerOpen,
    }),
    [closeTask, isTaskDrawerOpen, openQuickCreate, openTask]
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

  // Plain object — saveTaskPatch / deleteTask / addComment / etc. are
  // recreated every render today (no useCallback wrap), so memoizing this
  // would either need the whole callback set wrapped (out of scope) or
  // include them in deps (defeating the memo). Recreating the value each
  // render mirrors how the previous TaskDetailDrawer's prop set churned
  // — no behavior change for the inline consumer.
  const renderValue: TaskDetailRenderState = {
    isOpen: isTaskDrawerOpen,
    isLoading: isTaskLoading,
    isLoadingMembers: isLoadingOptions,
    error: drawerError,
    task,
    members,
    isUploadingAttachment,
    prerequisites,
    statusBlockerMessage,
    onBack: closeTask,
    onSavePatch: saveTaskPatch,
    onOpenPrerequisite: openTask,
    onDeleteTask: deleteTask,
    onAddComment: addComment,
    onUpdateComment: updateComment,
    onDeleteComment: deleteComment,
    onUploadAttachment: uploadAttachment,
    onDeleteAttachment: deleteAttachment,
  };

  return (
    <TaskUIContext.Provider value={contextValue}>
      <TaskDetailRenderContext.Provider value={renderValue}>
      {children}

      <TaskQuickCreateModal
        isOpen={isQuickCreateOpen}
        title={quickTitle}
        releaseQuery={quickReleaseQuery}
        selectedRelease={quickSelectedRelease}
        assigneeQuery={quickAssigneeQuery}
        selectedAssignee={quickSelectedAssignee}
        dueDate={quickDueDate}
        groupName={quickGroupName}
        groupColor={quickGroupColor}
        releases={releases}
        members={members}
        isLoadingReleases={isLoadingOptions}
        isSaving={isQuickSaving}
        errorMessage={quickError}
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
        onTagChange={(name, color) => {
          setQuickGroupName(name);
          setQuickGroupColor(color);
        }}
        onSubmit={createQuickTask}
      />

      {/* TaskDetailDrawer is gone — every entry point now renders the in-place
          TaskDetailView via `<TaskDetailInline />` in the consumer's own
          layout (workspace center column, release detail page). The drawer's
          fixed overlay + slide-in animation introduced perceived jank that
          we're explicitly trading for in-flow rendering. */}

      {/* Global undo-completion toast. The store owns the lifecycle; this
          renders the affordance wherever TaskUIProvider is mounted (currently
          AppShell, which covers every authenticated dashboard surface). */}
      <UndoCompletionToast />
      </TaskDetailRenderContext.Provider>
    </TaskUIContext.Provider>
  );
}

/**
 * In-place task detail. Renders the same body the legacy TaskDetailDrawer
 * used, but inline in the consumer's container — no fixed overlay, no
 * backdrop, no slide-in animation. Returns `null` until a task is open.
 *
 * Consumers (workspace center column, release detail page) mount this where
 * the task list would otherwise render and conditionally swap based on
 * `useTaskUI().isTaskOpen`.
 */
export function TaskDetailInline() {
  const state = useContext(TaskDetailRenderContext);
  if (!state || !state.isOpen) {
    return null;
  }

  return (
    <TaskDetailView
      isLoading={state.isLoading}
      isLoadingMembers={state.isLoadingMembers}
      error={state.error}
      task={state.task}
      members={state.members}
      isUploadingAttachment={state.isUploadingAttachment}
      prerequisites={state.prerequisites}
      statusBlockerMessage={state.statusBlockerMessage}
      onBack={state.onBack}
      onSavePatch={state.onSavePatch}
      onOpenPrerequisite={state.onOpenPrerequisite}
      onDeleteTask={state.onDeleteTask}
      onAddComment={state.onAddComment}
      onUpdateComment={state.onUpdateComment}
      onDeleteComment={state.onDeleteComment}
      onUploadAttachment={state.onUploadAttachment}
      onDeleteAttachment={state.onDeleteAttachment}
    />
  );
}
