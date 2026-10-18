'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { isValidNextMoveKey } from '@/lib/next-moves';

/**
 * Next moves (URG-259): which moves this person dismissed, and each rollout's
 * pitch facts. Dismissals are kept in two places: the server (so a dismiss
 * holds on every device) and this browser (so it holds offline, and before the
 * migration is applied). A move is hidden when either has it.
 */

const LOCAL_KEY_PREFIX = 'urganize.next-moves.dismissed';
const LOCAL_VERSION = 1;
/** Plenty for a person's open rollouts; the oldest fall off first. */
const LOCAL_MAX = 300;

export type RolloutPitchFacts = { count: number; lastSentDaysAgo: number | null } | null;

const isKeyList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((key) => typeof key === 'string');

const localKey = (userId: string) => `${LOCAL_KEY_PREFIX}.${userId}`;

function readLocal(userId: string): string[] {
  return (readPersistedState(localKey(userId), LOCAL_VERSION, isKeyList) ?? []).filter(isValidNextMoveKey);
}

function writeLocal(userId: string, keys: readonly string[]) {
  try {
    writePersistedState(localKey(userId), LOCAL_VERSION, keys.slice(-LOCAL_MAX));
  } catch {
    // Storage full or blocked: the server copy still holds it.
  }
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token || '';
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
}

type NextMovesState = {
  userId: string | null;
  dismissed: ReadonlySet<string>;
  pitches: Record<string, RolloutPitchFacts>;
  /** Whether they already have a team. Null until the server says, and the
   *  Invite move waits for a plain false, so it never flashes up for someone
   *  who invited people long ago. */
  hasTeam: boolean | null;
  /** Called after an invite goes out, so the Invite move goes at once. */
  markHasTeam: () => void;
  /** Requests already made this session, so two mounts ask once. */
  requested: Record<string, true>;
  /** Requests that have finished (answered, failed, timed out or had no
   *  session). Home waits for its own one before painting the One Thing, so a
   *  move dismissed on another device never shows for a frame (URG-364). */
  settled: Record<string, true>;
  load: (userId: string, releaseId?: string | null) => void;
  dismiss: (userId: string, key: string) => void;
};

/** Home's request key: Home asks with no rollout id. */
export const NEXT_MOVES_HOME_KEY = '_home';
const requestKey = (releaseId?: string | null) => releaseId || NEXT_MOVES_HOME_KEY;
/** Never hold Home's skeleton or a rollout's move cards longer than this on a
 *  slow or hung request. */
const SETTLE_TIMEOUT_MS = 4000;

/** True once a surface's dismissals (and, on a rollout, its pitch facts) are
 *  known for this person, or given up on. Every next-move surface waits for it
 *  before drawing a card (Home URG-364, rollout page URG-367). */
export const selectNextMovesSettled =
  (userId: string | null, releaseId?: string | null) =>
  (state: Pick<NextMovesState, 'userId' | 'settled'>): boolean =>
    Boolean(userId) && state.userId === userId && state.settled[requestKey(releaseId)] === true;

/** True once Home's dismissals for this person are known (or given up on). */
export const selectHomeMovesSettled = (userId: string | null) => selectNextMovesSettled(userId, null);

export const useNextMovesStore = create<NextMovesState>((set, get) => ({
  userId: null,
  dismissed: new Set(),
  pitches: {},
  hasTeam: null,
  requested: {},
  settled: {},

  markHasTeam: () => set({ hasTeam: true }),

  load: (userId, releaseId) => {
    if (!userId) return;
    // Another person signed in on this tab: start clean.
    if (get().userId !== userId) {
      set({ userId, dismissed: new Set(readLocal(userId)), pitches: {}, hasTeam: null, requested: {}, settled: {} });
    }
    const key = requestKey(releaseId);
    if (get().requested[key]) return;
    set((state) => ({ requested: { ...state.requested, [key]: true } }));

    const settle = () => {
      if (get().userId !== userId || get().settled[key]) return;
      set((state) => ({ settled: { ...state.settled, [key]: true } }));
    };
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = setTimeout(() => {
      controller?.abort();
      settle();
    }, SETTLE_TIMEOUT_MS);

    void (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const query = releaseId ? `?releaseId=${encodeURIComponent(releaseId)}` : '';
        const response = await fetch(`/api/next-moves${query}`, {
          headers,
          cache: 'no-store',
          signal: controller?.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { dismissed?: unknown; pitches?: RolloutPitchFacts; hasTeam?: unknown };
        if (get().userId !== userId) return;
        const server = isKeyList(body.dismissed) ? body.dismissed : [];
        set((state) => ({
          dismissed: new Set([...state.dismissed, ...server]),
          pitches: releaseId ? { ...state.pitches, [releaseId]: body.pitches ?? null } : state.pitches,
          // Once true it stays true this session (an invite sent here wins
          // over an older read).
          hasTeam: state.hasTeam === true ? true : typeof body.hasTeam === 'boolean' ? body.hasTeam : state.hasTeam,
        }));
      } catch {
        // Offline or timed out: the local copy is what there is.
      } finally {
        clearTimeout(timer);
        settle();
      }
    })();
  },

  dismiss: (userId, key) => {
    if (!userId || !isValidNextMoveKey(key)) return;
    const next = new Set(get().dismissed);
    next.add(key);
    set({ dismissed: next });
    writeLocal(userId, [...readLocal(userId).filter((k) => k !== key), key]);
    void (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        await fetch('/api/next-moves', { method: 'POST', headers, body: JSON.stringify({ key }) });
      } catch {
        // Kept locally; the card stays away on this device either way.
      }
    })();
  },
}));
