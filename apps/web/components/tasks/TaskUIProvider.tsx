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
import { TaskOutcomeSheet } from '@/components/tasks/TaskOutcomeSheet';
import { CoverArtPromptSheet } from '@/components/tasks/CoverArtPromptSheet';
import { UndoCompletionToast } from '@/components/tasks/UndoCompletionToast';
import { type ReleaseOption } from '@/lib/release-helpers';
import { isTypingTarget, type TaskCreateSource, type TaskDetail, type WorkspaceMember } from '@/lib/tasks';
import { useTaskStore } from '@/stores/useTaskStore';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { supabase } from '@/lib/supabase/client';
import { isNetworkFailure } from '@/lib/offline/network-error';
import { isBrowserOnline } from '@/lib/offline/status';
import { enqueue } from '@/lib/offline/queue';

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
  /**
   * Seeds the title field. The input is focused AND selected on open, so a
   * prefill is accepted by pressing Enter and replaced by simply typing —
   * which is what makes seeding it non-intrusive rather than something to
   * clear first.
   */
  title?: string;
};

type TaskUIContextValue = {
  openTask: (taskId: string) => void;
  openQuickCreate: (defaults?: QuickCreateDefaults) => void;
  closeTask: () => void;
  /** True while the task detail pop-up is open. Since 2026-07-23 the detail
   * renders as a centered modal mounted BY THIS PROVIDER — consumers no
   * longer swap their layout; they just call openTask and the pop-up
   * appears over whatever surface they're on. */
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
  onUploadAttachment: (file: File) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
};

const TaskDetailRenderContext = createContext<TaskDetailRenderState | null>(null);

export const TASKS_CHANGED_EVENT = 'urganize:tasks-changed';

const OFFLINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_OFFLINE === 'true';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || '';
}

async function getSessionUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.user?.id || '';
}

let offlineTaskCounter = 0;
function generateOfflineTaskId(): string {
  offlineTaskCounter += 1;
  return `offline-task-${Date.now()}-${offlineTaskCounter}`;
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
  const [quickSelectedAssignee, setQuickSelectedAssignee] = useState<WorkspaceMember | null>(null);
  const [quickDueDate, setQuickDueDate] = useState('');
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
    setQuickSelectedAssignee(null);
    setQuickDueDate('');
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
          outcome: null,
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
      // Seeded explicitly rather than relying on resetQuickCreate having
      // cleared it on close: passing '' when there is no prefill is what
      // guarantees one open's title can never leak into the next.
      setQuickTitle(defaults?.title ?? '');
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
    dueDate?: string | null;
    assignedToUserId?: string | null;
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
        // Sync the list row in place so every open surface (workspace
        // buckets, release detail list) reflects the edit IMMEDIATELY —
        // assignee cleared, title renamed, due date moved. The old
        // TASKS_CHANGED_EVENT lost its listeners when the legacy pages were
        // removed, so the store is the one live channel rows actually read.
        const fresh = payload.task;
        const taskStore = useTaskStore.getState();
        taskStore.setTasks(
          taskStore.tasks.map((row) =>
            row.id === fresh.id
              ? {
                  ...row,
                  title: fresh.title,
                  description: fresh.description,
                  status: fresh.status,
                  priority: fresh.priority,
                  dueDate: fresh.dueDate,
                  assignedToUserId: fresh.assignedToUserId,
                  assignee: fresh.assignee ?? null,
                  groupName: fresh.groupName,
                  groupColor: fresh.groupColor,
                  updatedAt: fresh.updatedAt,
                }
              : row
          )
        );
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

    const quickCreatePayload = {
      title: trimmedTitle,
      releaseId,
      groupId: quickCreateDefaults.groupId || null,
      assignedToUserId: quickSelectedAssignee?.userId || null,
      dueDate: quickDueDate ? new Date(quickDueDate).toISOString() : null,
    };

    setIsQuickSaving(true);
    setQuickError('');
    try {
      const payload = await requestJson<TaskDetailPayload>(`/api/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          ...quickCreatePayload,
          // Manually-created tasks are NOT compressed_runway — that flag is
          // template-only (set by lib/release-templates/instantiate.ts when
          // the computed offset lands before the release date). Past-due
          // manual tasks are genuine overdue, not catch-up. The server
          // mapper reads metadata.template.compressed_runway and defaults to
          // false when absent, which is the path we want here.
          autoGenerated: false,
          source: quickCreateDefaults.source || 'quick_create',
        }),
      });

      closeQuickCreate();

      // Immediate-sync: append the created task to the store so it appears
      // in the list right away (see the saveTaskPatch note — the changed
      // event has no listeners anymore, the store is the live channel).
      if (payload.task) {
        const taskStore = useTaskStore.getState();
        taskStore.setTasks([...taskStore.tasks, payload.task as (typeof taskStore.tasks)[number]]);
      }
      dispatchTasksChanged();

      if (payload.task?.id) {
        openTask(payload.task.id);
      }
    } catch (error) {
      // Offline (or a dropped connection mid-request): queue the create
      // instead of reporting it as a failure. The row appears immediately,
      // marked pendingSync so nothing tries to patch or complete it before
      // the queue replays it (lib/offline/queue.ts) and swaps in the real
      // server row. A network failure with the flag OFF, or any other kind
      // of error, falls through to the ordinary inline-error path below —
      // unchanged from before this feature existed.
      if (OFFLINE_ENABLED && (isNetworkFailure(error) || !isBrowserOnline())) {
        const userId = await getSessionUserId();
        if (userId) {
          const offlineId = generateOfflineTaskId();
          const nowIso = new Date().toISOString();
          const localTask = {
            id: offlineId,
            workspaceId: '',
            groupId: quickCreatePayload.groupId,
            releaseId: quickCreatePayload.releaseId,
            createdBy: userId,
            assignedToUserId: quickCreatePayload.assignedToUserId,
            assignedTo: null,
            title: quickCreatePayload.title,
            description: null,
            status: 'todo' as const,
            priority: 'none' as const,
            dueDate: quickCreatePayload.dueDate,
            completedAt: null,
            position: 0,
            requirement: null,
            dependencies: [],
            state: 'idea' as const,
            autoGenerated: false,
            taskType: 'task' as const,
            templateTaskId: null,
            compressedRunway: false,
            durationDays: null,
            groupName: null,
            groupColor: null,
            createdAt: nowIso,
            updatedAt: nowIso,
            pendingSync: true,
          };

          await enqueue({
            kind: 'task_create',
            userId,
            payload: quickCreatePayload,
          });

          closeQuickCreate();
          const taskStore = useTaskStore.getState();
          taskStore.setTasks([...taskStore.tasks, localTask as (typeof taskStore.tasks)[number]]);
          dispatchTasksChanged();
          return;
        }
      }

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

    const deletedTaskId = activeTaskId;
    await requestJson<{ ok: boolean }>(`/api/tasks/${deletedTaskId}`, {
      method: 'DELETE',
    });

    // Same immediate-sync rationale as saveTaskPatch: drop the row from the
    // store so it vanishes from the list the moment the modal closes.
    const taskStore = useTaskStore.getState();
    taskStore.setTasks(taskStore.tasks.filter((row) => row.id !== deletedTaskId));

    closeTask();
    setTask(null);
    dispatchTasksChanged();
  };

  // Comments were removed from the activity view (founder call,
  // 2026-07-23) — the /api/tasks/[id]/comments routes stay dormant.
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

  // Plain object — saveTaskPatch / deleteTask / uploadAttachment / etc. are
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
        selectedAssignee={quickSelectedAssignee}
        dueDate={quickDueDate}
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
        onSelectAssignee={(member) => {
          setQuickSelectedAssignee(member);
        }}
        onDueDateChange={setQuickDueDate}
        pendingReleaseId={quickCreateDefaults.releaseId || null}
        onSubmit={createQuickTask}
      />

      {/* Task detail pop-up (2026-07-23, founder call — reverses the earlier
          inline-view decision): a single centered modal mounted here at the
          provider so every entry point (workspace row, release detail row,
          notification bell, Chappi chip) opens the same surface without any
          consumer layout swaps. */}
      <TaskDetailModal />

      {/* Global undo-completion toast. The store owns the lifecycle; this
          renders the affordance wherever TaskUIProvider is mounted (currently
          AppShell, which covers every authenticated dashboard surface). */}
      <UndoCompletionToast />

      {/* Post-completion check-in ("Done. How did it go?"). Rendered after the
          detail pop-up so a completion triggered from inside that pop-up
          stacks the sheet above it — both live on the z-[170] modal tier. The
          store decides whether this or the undo toast fires; never both. */}
      <TaskOutcomeSheet />

      {/* "Add the cover art", after a cover-art playbook step is ticked. Same
          tier and same either/or: the store picks exactly one bottom surface
          per completion, and this one outranks both of the above. */}
      <CoverArtPromptSheet />
      </TaskDetailRenderContext.Provider>
    </TaskUIContext.Provider>
  );
}

/**
 * The task detail pop-up. Mounted once by TaskUIProvider; renders nothing
 * until a task is open, then a centered dialog over a blurred scrim.
 *
 * Pop-up mechanics, deliberately tuned:
 * - Scrim: same treatment as TaskQuickCreateModal (black/55 + subtle blur),
 *   click-outside closes. z-[170] — the app's modal tier, above ChappiDock.
 * - Entrance: 200ms fade + slight scale/rise (tailwindcss-animate), so the
 *   panel lands rather than snaps.
 * - The panel owns its scroll: max-height caps it inside the viewport and
 *   long bodies (comments, attachments) scroll INSIDE the dialog with
 *   overscroll containment — the page behind never scrolls.
 * - Body scroll lock while open (restored on close/unmount).
 * - On phones it docks to the bottom edge sheet-style, full-width; from sm
 *   up it floats centered.
 * - Escape closes (handled inside TaskDetailView, with a typing guard so
 *   Escape mid-edit doesn't dismiss the pop-up).
 */
function TaskDetailModal() {
  const state = useContext(TaskDetailRenderContext);
  const isOpen = Boolean(state?.isOpen);

  // Shared ref-counted lock, NOT a hand-rolled save/restore of
  // body.style.overflow (2026-08-16). This modal is the one that stacks by
  // design — TaskOutcomeSheet mounts above it on completion, and that sheet
  // takes the shared lock — so the hand-rolled version hit exactly the bug
  // lib/body-scroll-lock.ts was written to eliminate: the sheet captured
  // 'hidden' as its "original", and whichever closed second wrote 'hidden'
  // back permanently. The page then could not scroll until a full reload.
  useEffect(() => {
    if (!isOpen) return;
    return lockBodyScroll();
  }, [isOpen]);

  if (!state || !state.isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/55 backdrop-blur-[2px] animate-in fade-in duration-200 sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          state.onBack();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Activity detail"
        className="urg-cartouche flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface sm:rounded-2xl shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 sm:max-h-[85dvh] sm:max-w-2xl sm:border"
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
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
            onUploadAttachment={state.onUploadAttachment}
            onDeleteAttachment={state.onDeleteAttachment}
          />
        </div>
      </div>
    </div>
  );
}
