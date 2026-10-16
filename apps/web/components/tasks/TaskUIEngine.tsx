'use client';

import { isBareKey } from '@/lib/keyboard-shortcuts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { TaskDetailPatchInput } from '@/components/tasks/TaskDetailView';
import type { DependencyTaskSummary } from '@/components/tasks/TaskDependenciesSection';
import { UndoCompletionToast } from '@/components/tasks/UndoCompletionToast';
import { type ReleaseOption } from '@/lib/release-helpers';
import { isTypingTarget, type TaskCreateSource, type TaskDetail, type WorkspaceMember } from '@/lib/tasks';
import type { RolloutPhase } from '@/types/tasks';
import { useTaskStore } from '@/stores/useTaskStore';
import { lockBodyScroll } from '@/lib/body-scroll-lock';
import { useDialogFocus } from '@/lib/use-dialog-focus';
import { supabase } from '@/lib/supabase/client';
import { isNetworkFailure } from '@/lib/offline/network-error';
import { isBrowserOnline } from '@/lib/offline/status';
import { enqueue } from '@/lib/offline/queue';
import { runWhenIdle, shouldBackgroundPrefetch } from '@/lib/connection';
import { SkeletonBlock } from '@/components/loading/SkeletonBlock';
import {
  TASKS_CHANGED_EVENT,
  type QuickCreateDefaults,
  type TaskUIEngineBridge,
} from '@/components/tasks/TaskUIProvider';

// The task UI engine (URG-314 batch 6, 2026-10-16): everything behind
// useTaskUI() that is not the context itself. TaskUIProvider (the root
// layout's light half) loads this file on demand, on /dashboard and /settings
// or the moment anything asks for a task surface or loads the task store, so
// /auth, onboarding and the public pages never download the task store, the
// offline queue or the undo toast. It renders nothing on the server (the
// provider mounts it ssr:false) and nothing on the client until a task is open,
// a completion asks for a sheet, or the quick-create modal opens.

// The four task surfaces below are lazy (2026-10-15, perf pass URG-314).
// TaskUIProvider is mounted by AppShell for every page, /auth included, so as
// static imports the detail pop-up (comments, attachments, pitch panel,
// dependencies), the quick-create modal and the two completion sheets rode in
// the root layout's render-blocking JavaScript of every route, around 60 KB
// minified, though none of them is on screen until someone opens a task or
// ticks one off. Each is now its own chunk, mounted only when it is needed,
// and warmed on idle (warmTaskSurfaces) on a connection that can afford it, so
// the first tap still opens instantly. ssr:false: none of them renders
// anything on the server.
const loadTaskDetailView = () => import('@/components/tasks/TaskDetailView');
const loadTaskQuickCreateModal = () => import('@/components/tasks/TaskQuickCreateModal');
const loadTaskOutcomeSheet = () => import('@/components/tasks/TaskOutcomeSheet');
const loadCoverArtPromptSheet = () => import('@/components/tasks/CoverArtPromptSheet');

const TaskDetailView = dynamic(() => loadTaskDetailView().then((m) => m.TaskDetailView), {
  ssr: false,
  loading: () => <TaskDetailLoading />,
});
const TaskQuickCreateModal = dynamic(
  () => loadTaskQuickCreateModal().then((m) => m.TaskQuickCreateModal),
  { ssr: false }
);
const TaskOutcomeSheet = dynamic(() => loadTaskOutcomeSheet().then((m) => m.TaskOutcomeSheet), {
  ssr: false,
});
const CoverArtPromptSheet = dynamic(
  () => loadCoverArtPromptSheet().then((m) => m.CoverArtPromptSheet),
  { ssr: false }
);

/** Fetch the task surfaces' chunks ahead of the first tap. Idempotent: the
 * bundler caches each import() promise. */
function warmTaskSurfaces() {
  void loadTaskDetailView().catch(() => undefined);
  void loadTaskQuickCreateModal().catch(() => undefined);
  void loadTaskOutcomeSheet().catch(() => undefined);
  void loadCoverArtPromptSheet().catch(() => undefined);
}

/** Shown for the moment the detail chunk is still downloading on a cold tap. */
function TaskDetailLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading activity">
      <SkeletonBlock className="h-7 w-2/3 rounded-lg" />
      <SkeletonBlock className="h-4 w-1/3 rounded" />
      <SkeletonBlock className="h-24 rounded-xl" />
    </div>
  );
}

/** The completion sheets decide for themselves when to show (they read the
 * task store). Gating the mount on the same store fields keeps their chunks
 * from being requested at all until a completion asks for one. */
function TaskOutcomeSheetGate() {
  const active = useTaskStore((state) => Boolean(state.outcomePrompt));
  return active ? <TaskOutcomeSheet /> : null;
}

function CoverArtPromptSheetGate() {
  const active = useTaskStore((state) => Boolean(state.coverArtPrompt));
  return active ? <CoverArtPromptSheet /> : null;
}

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
  onSendComment: (content: string) => Promise<void>;
  onEditComment: (commentId: string, content: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
};

const TaskDetailRenderContext = createContext<TaskDetailRenderState | null>(null);

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

export function TaskUIEngine({ bridge }: { bridge: TaskUIEngineBridge }) {
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
  // Latch: the quick-create modal's chunk is only requested once someone
  // first opens it, then the modal stays mounted so its close transition and
  // its reset-on-close effects behave exactly as they did before it was lazy.
  const [hasOpenedQuickCreate, setHasOpenedQuickCreate] = useState(false);
  if (isQuickCreateOpen && !hasOpenedQuickCreate) setHasOpenedQuickCreate(true);
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

  // Warm the lazy task surfaces once someone is inside the app, on idle and
  // only on a connection that can afford speculative bytes (lib/connection).
  // /auth and the public pages never pay for them.
  useEffect(() => {
    if (!shouldShowTaskShell || !shouldBackgroundPrefetch()) return;
    return runWhenIdle(warmTaskSurfaces, 5_000);
  }, [shouldShowTaskShell]);

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

      // A bare C only (URG-92): with ⌘, Ctrl or Alt held it is copy or
      // another app's shortcut, and must be left alone.
      if (event.key.toLowerCase() === 'c' && isBareKey(event) && !event.repeat) {
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
          // Safe default until the real fetch resolves and tells us for
          // certain — the composer stays hidden for this one frame rather
          // than briefly offering to post before hasTaskThreadAccess's real
          // answer arrives.
          canComment: false,
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
    planKey?: boolean;
    phase?: RolloutPhase | null;
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
                  planKey: fresh.planKey,
                  phase: fresh.phase,
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

          // The queue item's id MUST be the placeholder row's id: sync.ts's
          // onSynced swaps the local row by matching `task.id === item.id`.
          // Without this, enqueue mints its own id, that match never holds,
          // and a task that synced perfectly well keeps showing "Waiting to
          // sync" until the next full reload.
          await enqueue({
            id: offlineId,
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

  // The task's chat thread (Release & Task Chat, Phase 1). All three go
  // through the existing /comments routes — already-shipped backend, narrowed
  // by ensureTaskThreadAccess — and refresh the open task the same way every
  // other mutation here does, rather than optimistically patching
  // state.task.comments: a thread's own ordering/author data is cheap to
  // re-fetch and this keeps one source of truth.
  const sendComment = async (content: string) => {
    if (!activeTaskId) {
      return;
    }

    await requestJson<{ comments: TaskDetail['comments'] }>(`/api/tasks/${activeTaskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    await refreshOpenTask();
  };

  const editComment = async (commentId: string, content: string) => {
    if (!activeTaskId) {
      return;
    }

    await requestJson<{ comments: TaskDetail['comments'] }>(
      `/api/tasks/${activeTaskId}/comments/${commentId}`,
      { method: 'PATCH', body: JSON.stringify({ content }) }
    );
    await refreshOpenTask();
  };

  const deleteComment = async (commentId: string) => {
    if (!activeTaskId) {
      return;
    }

    await requestJson<{ comments: TaskDetail['comments'] }>(
      `/api/tasks/${activeTaskId}/comments/${commentId}`,
      { method: 'DELETE' }
    );
    await refreshOpenTask();
  };

  // Hand the provider the real handlers. Calls made before this chunk arrived
  // were queued by the provider and replay now, in order.
  useEffect(
    () => bridge.register({ openTask, openQuickCreate, closeTask }),
    [bridge, closeTask, openQuickCreate, openTask]
  );

  // useTaskUI().isTaskOpen lives in the provider's state; keep it in step.
  useEffect(() => {
    bridge.setIsTaskOpen(isTaskDrawerOpen);
  }, [bridge, isTaskDrawerOpen]);

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
    onSendComment: sendComment,
    onEditComment: editComment,
    onDeleteComment: deleteComment,
  };

  return (
    <TaskDetailRenderContext.Provider value={renderValue}>
      {hasOpenedQuickCreate ? (
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
      ) : null}

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
      <TaskOutcomeSheetGate />

      {/* "Add the cover art", after a cover-art playbook step is ticked. Same
          tier and same either/or: the store picks exactly one bottom surface
          per completion, and this one outranks both of the above. */}
      <CoverArtPromptSheetGate />
    </TaskDetailRenderContext.Provider>
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

  // Focus goes to the pop-up itself rather than its first control: the panel
  // is long, and landing on a control would announce a checkbox before the
  // person has heard which activity this is. Tab then enters it. The stack in
  // lib/dialog-stack.ts is what lets the completion sheet open ABOVE this and
  // take Tab without the two trapping against each other.
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, panelRef, { initialFocus: 'panel' });

  // The pop-up always opens on its title (founder screenshot, 2026-10-11: the
  // title and its checkbox opened half hidden under the sticky Delete / Close
  // bar). The body starts at the top for each activity and again once its
  // details finish loading, and scroll anchoring is off so the skeleton giving
  // way to the real fields can never nudge it down.
  const bodyRef = useRef<HTMLDivElement>(null);
  const openTaskId = state?.task?.id ?? null;
  const loading = Boolean(state?.isLoading);
  useLayoutEffect(() => {
    if (!isOpen) return;
    const body = bodyRef.current;
    if (!body) return;
    body.scrollTop = 0;
    const frame = requestAnimationFrame(() => {
      body.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, openTaskId, loading]);

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
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Activity detail"
        className="urg-cartouche flex max-h-[92dvh] focus:outline-none w-full flex-col overflow-hidden rounded-t-2xl border-t border-stroke-strong bg-bg-surface sm:rounded-2xl shadow-[0_28px_80px_-38px_rgb(var(--shadow-ink)/calc(0.68*var(--shadow-alpha-scale)))] animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 sm:max-h-[85dvh] sm:max-w-2xl sm:border"
      >
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 [overflow-anchor:none] sm:p-6">
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
            onSendComment={state.onSendComment}
            onEditComment={state.onEditComment}
            onDeleteComment={state.onDeleteComment}
          />
        </div>
      </div>
    </div>
  );
}
