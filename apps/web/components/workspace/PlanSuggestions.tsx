'use client';

import { useEffect, useId, useState } from 'react';
import { create } from 'zustand';
import { ChevronDown, Plus } from '@/components/icons';
import { getAccessToken } from '@/components/content-calendar/get-access-token';
import { TASKS_CHANGED_EVENT } from '@/components/tasks/TaskUIProvider';
import { useTaskStore } from '@/stores/useTaskStore';
import { hideNudge, useHiddenNudgeSet } from '@/lib/hidden-nudges';
import { ROLLOUT_PHASE_LABELS, ROLLOUT_PHASE_ORDER, type RolloutPhase } from '@/lib/rollout-phases';
import type { Task } from '@/types/tasks';

/**
 * A smaller plan's suggestions (URG-318): the work the plan kept but did not
 * make an activity of, offered as a quiet "N suggested" row. Open it and tap +
 * to add one with its date and owner, or "No thanks" to drop it (founder,
 * Oct 31, 2026, #919; kept in this browser, so the count goes down). Only plans
 * built since 2026-10-16 have any; everywhere else this renders nothing.
 */

export type PlanSuggestionItem = {
  id: string;
  title: string;
  why: string;
  phase: RolloutPhase;
  dueDate: string | null;
  ownerName: string | null;
};

type Toast = { releaseId: string; taskId: string; title: string; phase: RolloutPhase; tick: number };

type SuggestionsState = {
  byRelease: Record<string, PlanSuggestionItem[] | undefined>;
  adding: Record<string, boolean>;
  toast: Toast | null;
  load: (releaseId: string) => Promise<void>;
  add: (releaseId: string, item: PlanSuggestionItem) => Promise<void>;
  undo: () => Promise<void>;
  dismissToast: () => void;
};

const TOAST_MS = 5000;
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
let toastTimer: ReturnType<typeof setTimeout> | null = null;

async function authed(input: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

export const usePlanSuggestionsStore = create<SuggestionsState>((set, get) => ({
  byRelease: {},
  adding: {},
  toast: null,
  load: async (releaseId) => {
    try {
      const response = await authed(`/api/releases/${releaseId}/plan/suggestions`);
      if (!response.ok) return;
      const payload = (await response.json()) as { suggestions?: PlanSuggestionItem[] };
      set((state) => ({ byRelease: { ...state.byRelease, [releaseId]: payload.suggestions ?? [] } }));
    } catch {
      // Suggestions are extra: a failed read just shows none.
    }
  },
  add: async (releaseId, item) => {
    if (get().adding[item.id]) return;
    set((state) => ({ adding: { ...state.adding, [item.id]: true } }));
    try {
      const response = await authed(`/api/releases/${releaseId}/plan/suggestions`, {
        method: 'POST',
        body: JSON.stringify({ id: item.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as { task?: Task; code?: string };
      if (response.ok && payload.task) {
        const task = payload.task;
        useTaskStore.setState((state) => ({ tasks: [task, ...state.tasks.filter((t) => t.id !== task.id)] }));
        window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
        set((state) => ({
          byRelease: {
            ...state.byRelease,
            [releaseId]: (state.byRelease[releaseId] ?? []).filter((s) => s.id !== item.id),
          },
          toast: { releaseId, taskId: task.id, title: item.title, phase: item.phase, tick: Date.now() },
        }));
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => get().dismissToast(), TOAST_MS);
      } else if (payload.code === 'already_added') {
        await get().load(releaseId);
      }
    } finally {
      set((state) => {
        const adding = { ...state.adding };
        delete adding[item.id];
        return { adding };
      });
    }
  },
  undo: async () => {
    const toast = get().toast;
    if (!toast) return;
    set({ toast: null });
    if (toastTimer) clearTimeout(toastTimer);
    const response = await authed(`/api/tasks/${toast.taskId}`, { method: 'DELETE' });
    if (response.ok) {
      useTaskStore.setState((state) => ({ tasks: state.tasks.filter((t) => t.id !== toast.taskId) }));
      window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT));
    }
    await get().load(toast.releaseId);
  },
  dismissToast: () => set({ toast: null }),
}));

/**
 * The suggestions for one rollout. Reads only for a smaller plan (some task
 * carries `planCore`), and again whenever its activities come or go.
 */
export function usePlanSuggestions(releaseId: string | null, tasks: Task[]): PlanSuggestionItem[] {
  const isCorePlan = tasks.some((task) => task.planCore);
  const items = usePlanSuggestionsStore((state) => (releaseId ? state.byRelease[releaseId] : undefined));
  const load = usePlanSuggestionsStore((state) => state.load);
  const count = tasks.length;
  useEffect(() => {
    if (!releaseId || !isCorePlan) return;
    void load(releaseId);
  }, [releaseId, isCorePlan, count, load]);
  const all = isCorePlan && items ? items : [];
  const [declined] = useHiddenNudgeSet(
    declinedPrefix(releaseId ?? ''),
    all.map((item) => item.id)
  );
  return declined.size ? all.filter((item) => !declined.has(item.id)) : all;
}

const declinedPrefix = (releaseId: string) => `plan-suggestion:${releaseId}:`;

function formatDue(ymd: string | null): string {
  if (!ymd) return '';
  const date = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function SuggestionRow({ releaseId, item }: { releaseId: string; item: PlanSuggestionItem }) {
  const add = usePlanSuggestionsStore((state) => state.add);
  const busy = usePlanSuggestionsStore((state) => Boolean(state.adding[item.id]));
  const meta = [formatDue(item.dueDate), item.ownerName].filter(Boolean).join(' · ');
  return (
    <li className="flex items-center gap-3 border-t border-stroke-subtle bg-bg-base px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-content-secondary" title={item.why || item.title}>
          {item.title}
        </p>
        {meta ? <p className="mt-0.5 truncate font-mono text-[11px] text-content-tertiary">{meta}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => void add(releaseId, item)}
        disabled={busy}
        aria-label={`Add ${item.title}`}
        className="motion-focus motion-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stroke-strong text-content-primary transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => hideNudge(`${declinedPrefix(releaseId)}${item.id}`)}
        disabled={busy}
        aria-label={`No thanks: ${item.title}`}
        className="motion-focus -mr-2 inline-flex h-8 shrink-0 items-center rounded-lg px-2 text-xs font-medium text-content-secondary hover:text-content-primary disabled:opacity-50"
      >
        No thanks
      </button>
    </li>
  );
}

function SuggestedToggle({
  count,
  open,
  onToggle,
  controlsId,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controlsId}
      className={`motion-focus flex w-full items-center gap-3 border-t border-stroke-subtle px-4 py-2.5 text-left text-sm transition-colors hover:bg-bg-hover ${
        open ? 'text-content-primary' : 'text-content-tertiary'
      }`}
    >
      <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{count} suggested</span>
      <ChevronDown
        className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        aria-hidden="true"
      />
    </button>
  );
}

/** One phase's "N suggested" row, for the end of that phase's list. Nothing
 *  to suggest renders nothing. */
export function PhaseSuggestions({
  releaseId,
  phase,
  items,
}: {
  releaseId: string;
  phase: RolloutPhase;
  items: PlanSuggestionItem[];
}) {
  const [open, setOpen] = useState(false);
  const mine = items.filter((item) => item.phase === phase);
  if (mine.length === 0) return null;
  const id = `plan-suggestions-${phase}`;
  return (
    <div>
      <SuggestedToggle count={mine.length} open={open} onToggle={() => setOpen(!open)} controlsId={id} />
      {open ? (
        <ul id={id}>
          {mine.map((item) => (
            <SuggestionRow key={item.id} releaseId={releaseId} item={item} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Every phase's suggestions in one block, for views that are not grouped by
 *  phase (the timeline). Nothing to suggest renders nothing. */
export function PlanSuggestionsBlock({ releaseId, items }: { releaseId: string; items: PlanSuggestionItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const id = 'plan-suggestions-all';
  return (
    <div className="overflow-hidden rounded-xl border border-stroke-subtle [&>button:first-child]:border-t-0">
      <SuggestedToggle count={items.length} open={open} onToggle={() => setOpen(!open)} controlsId={id} />
      {open ? (
        <div id={id}>
          {ROLLOUT_PHASE_ORDER.map((phase) => {
            const mine = items.filter((item) => item.phase === phase);
            if (mine.length === 0) return null;
            return (
              <div key={phase}>
                <p className="border-t border-stroke-subtle px-4 pb-1 pt-3 text-xs font-semibold text-content-secondary">
                  {ROLLOUT_PHASE_LABELS[phase]}
                </p>
                <ul>
                  {mine.map((item) => (
                    <SuggestionRow key={item.id} releaseId={releaseId} item={item} />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// The toast may be mounted by more than one surface at once (the list and the
// timeline); the first one mounted draws it, so it never shows twice.
const toastHosts: string[] = [];
const useToastHost = create<{ host: string | null; set: (host: string | null) => void }>((set) => ({
  host: null,
  set: (host) => set({ host }),
}));

/** "Added to Pre-release · Undo", for five seconds after a tap. */
export function PlanSuggestionToast() {
  const id = useId();
  const host = useToastHost((state) => state.host);
  useEffect(() => {
    toastHosts.push(id);
    useToastHost.getState().set(toastHosts[0] ?? null);
    return () => {
      const index = toastHosts.indexOf(id);
      if (index >= 0) toastHosts.splice(index, 1);
      useToastHost.getState().set(toastHosts[0] ?? null);
    };
  }, [id]);
  const toast = usePlanSuggestionsStore((state) => state.toast);
  const undo = usePlanSuggestionsStore((state) => state.undo);
  if (!toast || host !== id) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${
        MOBILE_NAV_ENABLED ? 'mobile-nav-raise lg:bottom-8' : 'bottom-6 sm:bottom-8'
      }`}
    >
      <div
        key={toast.tick}
        className="task-undo-toast pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border border-stroke-default bg-bg-elevated px-4 py-3 text-sm text-content-primary shadow-lg"
      >
        <span className="min-w-0 flex-1 truncate">Added to {ROLLOUT_PHASE_LABELS[toast.phase]}</span>
        <button
          type="button"
          onClick={() => void undo()}
          className="motion-focus shrink-0 text-sm font-semibold text-brand transition-colors hover:text-brand-hover"
        >
          Undo
        </button>
      </div>
    </div>
  );
}
