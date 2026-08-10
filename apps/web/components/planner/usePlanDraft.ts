'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase/client';
import { usePlannerStore } from '@/stores/usePlannerStore';
import {
  PLAN_DRAFT_SCHEMA_VERSION,
  derivePlanPhase,
  type DraftTask,
  type PlanPhase,
  type ReleasePlanDraft,
  type ReleasePlanDraftDoc,
} from '@/lib/release-planning';

/**
 * The draft plan's state, owned by the review scene.
 *
 * Deliberately not a global store. The scene is the only consumer, the document
 * is under an autosave queue, and a cached copy of a plan somebody is actively
 * editing is a corruption vector rather than a speedup — which is also why
 * 'plan' is excluded from the scene cache.
 *
 * The autosave loop follows the notes editor's discipline: one save in flight at
 * a time, and when it returns, look at the draft again rather than recursing.
 * Text typed mid-request goes out on the next lap instead of racing.
 */

const AUTOSAVE_DEBOUNCE_MS = 800;

export type PlanDraftPhase = 'loading' | 'ready' | 'missing' | 'error';
export type PlanSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

export type UsePlanDraft = {
  phase: PlanDraftPhase;
  doc: ReleasePlanDraftDoc | null;
  saveState: PlanSaveState;
  error: string;
  /** A generate call is in flight for this release; no draft exists yet. */
  isGenerating: boolean;
  regeneratingPhase: PlanPhase | null;
  phaseError: { phase: PlanPhase; message: string } | null;
  isApproving: boolean;
  reload: () => void;
  updateTask: (taskId: string, changes: Partial<DraftTask>) => void;
  removeTask: (taskId: string) => void;
  restoreTask: (taskId: string) => void;
  addTask: (phase: PlanPhase, offsetDays: number) => void;
  regeneratePhase: (phase: PlanPhase) => Promise<boolean>;
  approve: () => Promise<{ ok: true; tasksCreated: number; warnings: string[] } | { ok: false }>;
  discard: () => Promise<boolean>;
};

export function usePlanDraft(releaseId: string): UsePlanDraft {
  const isGenerating = usePlannerStore((state) =>
    state.generatingReleaseIds.includes(releaseId)
  );

  const [phase, setPhase] = useState<PlanDraftPhase>('loading');
  const [draft, setDraft] = useState<ReleasePlanDraft | null>(null);
  const [saveState, setSaveState] = useState<PlanSaveState>('idle');
  const [error, setError] = useState('');
  const [regeneratingPhase, setRegeneratingPhase] = useState<PlanPhase | null>(null);
  const [phaseError, setPhaseError] = useState<{ phase: PlanPhase; message: string } | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // The document the autosave loop reads. Kept in a ref as well as state so a
  // save that finishes can compare against the very latest edits without being
  // recreated on every keystroke.
  const pendingRef = useRef<ReleasePlanDraftDoc | null>(null);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // --- Load -------------------------------------------------------------------

  useEffect(() => {
    if (!releaseId) return;
    let cancelled = false;

    const load = async () => {
      setPhase((current) => (current === 'ready' ? current : 'loading'));
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Your session expired. Sign in again.');

        const response = await fetch(`/api/releases/${releaseId}/plan`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const payload = (await response.json().catch(() => ({}))) as {
          draft?: ReleasePlanDraft | null;
          error?: string;
        };

        if (cancelled) return;

        if (!response.ok) {
          setError(payload.error || 'Could not load your draft.');
          setPhase('error');
          return;
        }

        if (!payload.draft) {
          setDraft(null);
          setPhase('missing');
          return;
        }

        setDraft(payload.draft);
        pendingRef.current = payload.draft.doc;
        setSaveState('idle');
        setError('');
        setPhase('ready');
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Could not load your draft.');
        setPhase('error');
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // isGenerating is in the deps so the scene refetches the moment the
    // generate call the intake fired resolves.
  }, [releaseId, reloadKey, isGenerating]);

  // --- Autosave ---------------------------------------------------------------

  const flush = useCallback(async () => {
    // One save in flight at a time. A second caller returns immediately: the
    // loop below will pick up whatever they left in the ref.
    if (savingRef.current) return;
    if (!pendingRef.current) return;

    savingRef.current = true;

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Your session expired.');

      // Keep going while the document changed under the request that was in
      // flight, so text typed mid-save goes out on the next lap rather than
      // racing the one before it.
      while (pendingRef.current) {
        const doc: ReleasePlanDraftDoc = pendingRef.current;
        if (mountedRef.current) setSaveState('saving');

        const response = await fetch(`/api/releases/${releaseId}/plan`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ doc }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Couldn't save");
        }

        // Same object still pending means nothing was typed while we waited.
        if (pendingRef.current === doc) {
          if (mountedRef.current) setSaveState('saved');
          break;
        }
      }
    } catch {
      if (mountedRef.current) setSaveState('error');
    } finally {
      savingRef.current = false;
    }
  }, [releaseId]);

  const scheduleSave = useCallback(
    (doc: ReleasePlanDraftDoc) => {
      pendingRef.current = doc;
      setSaveState('dirty');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flush();
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  // Never leave an edit behind on unmount: closing the scene or navigating away
  // flushes whatever is still pending.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current && !savingRef.current) void flush();
    },
    [flush]
  );

  const mutate = useCallback(
    (transform: (doc: ReleasePlanDraftDoc) => ReleasePlanDraftDoc) => {
      setDraft((current) => {
        if (!current) return current;
        const nextDoc = transform(current.doc);
        scheduleSave(nextDoc);
        return { ...current, doc: nextDoc };
      });
    },
    [scheduleSave]
  );

  const updateTask = useCallback(
    (taskId: string, changes: Partial<DraftTask>) => {
      mutate((doc) => ({
        ...doc,
        tasks: doc.tasks.map((task) => {
          if (task.id !== taskId) return task;
          const next = { ...task, ...changes };
          // Any hand edit protects the row from a later phase redraft.
          next.edited = true;
          if (typeof changes.offset_days === 'number') {
            next.phase = derivePlanPhase(changes.offset_days);
          }
          return next;
        }),
      }));
    },
    [mutate]
  );

  const removeTask = useCallback(
    (taskId: string) => {
      mutate((doc) => ({
        ...doc,
        tasks: doc.tasks.map((task) =>
          task.id === taskId ? { ...task, removed: true, removed_by: 'user' as const } : task
        ),
      }));
    },
    [mutate]
  );

  const restoreTask = useCallback(
    (taskId: string) => {
      mutate((doc) => ({
        ...doc,
        tasks: doc.tasks.map((task) =>
          task.id === taskId ? { ...task, removed: false, removed_by: null } : task
        ),
      }));
    },
    [mutate]
  );

  const addTask = useCallback(
    (targetPhase: PlanPhase, offsetDays: number) => {
      mutate((doc) => {
        const id = `user_${Math.random().toString(36).slice(2, 10)}${doc.tasks.length}`;
        const task: DraftTask = {
          id,
          template_task_id: null,
          origin: 'user',
          title: '',
          why: '',
          phase: targetPhase,
          offset_days: offsetDays,
          duration_days: 1,
          role: null,
          assignee_user_id: null,
          optional: false,
          task_type: 'task',
          tags: [],
          depends_on: [],
          removed: false,
          removed_by: null,
          edited: true,
        };
        return { ...doc, tasks: [...doc.tasks, task] };
      });
    },
    [mutate]
  );

  // --- Phase redraft ----------------------------------------------------------

  const regeneratePhase = useCallback(
    async (targetPhase: PlanPhase): Promise<boolean> => {
      setRegeneratingPhase(targetPhase);
      setPhaseError(null);

      // Any pending edit goes first, or the server would redraft an older plan.
      if (timerRef.current) clearTimeout(timerRef.current);
      await flush();

      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Your session expired.');

        const response = await fetch(`/api/releases/${releaseId}/plan/regenerate-phase`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase: targetPhase }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          draft?: ReleasePlanDraft;
          error?: string;
        };

        if (!response.ok || !payload.draft) {
          throw new Error(payload.error || 'Could not redraft this phase. No changes made.');
        }

        if (mountedRef.current) {
          setDraft(payload.draft);
          pendingRef.current = payload.draft.doc;
          setSaveState('idle');
        }
        return true;
      } catch (regenerateError) {
        if (mountedRef.current) {
          setPhaseError({
            phase: targetPhase,
            message:
              regenerateError instanceof Error
                ? regenerateError.message
                : 'Could not redraft this phase. No changes made.',
          });
        }
        return false;
      } finally {
        if (mountedRef.current) setRegeneratingPhase(null);
      }
    },
    [flush, releaseId]
  );

  // --- Approve ----------------------------------------------------------------

  const approve = useCallback(async () => {
    setIsApproving(true);

    // Approval reads the draft from the database, so every pending edit has to
    // have landed before it runs.
    if (timerRef.current) clearTimeout(timerRef.current);
    await flush();

    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Your session expired.');

      const response = await fetch(`/api/releases/${releaseId}/plan/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        tasksCreated?: number;
        warnings?: string[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error || 'Could not schedule the plan. Your draft is untouched. Try again.'
        );
      }

      return {
        ok: true as const,
        tasksCreated: payload.tasksCreated || 0,
        warnings: payload.warnings || [],
      };
    } catch (approveError) {
      if (mountedRef.current) {
        setError(
          approveError instanceof Error
            ? approveError.message
            : 'Could not schedule the plan. Your draft is untouched. Try again.'
        );
      }
      return { ok: false as const };
    } finally {
      if (mountedRef.current) setIsApproving(false);
    }
  }, [flush, releaseId]);

  const discard = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) clearTimeout(timerRef.current);
    pendingRef.current = null;

    try {
      const token = await getAccessToken();
      if (!token) return false;
      const response = await fetch(`/api/releases/${releaseId}/plan`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return false;
      if (mountedRef.current) {
        setDraft(null);
        setPhase('missing');
      }
      return true;
    } catch {
      return false;
    }
  }, [releaseId]);

  const reload = useCallback(() => {
    pendingRef.current = null;
    setReloadKey((key) => key + 1);
  }, []);

  return {
    phase,
    doc: draft?.doc ?? null,
    saveState,
    error,
    isGenerating,
    regeneratingPhase,
    phaseError,
    isApproving,
    reload,
    updateTask,
    removeTask,
    restoreTask,
    addTask,
    regeneratePhase,
    approve,
    discard,
  };
}

export { PLAN_DRAFT_SCHEMA_VERSION };
