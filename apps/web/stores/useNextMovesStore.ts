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
  load: (userId: string, releaseId?: string | null) => void;
  dismiss: (userId: string, key: string) => void;
};

const requestKey = (releaseId?: string | null) => releaseId || '_home';

export const useNextMovesStore = create<NextMovesState>((set, get) => ({
  userId: null,
  dismissed: new Set(),
  pitches: {},
  hasTeam: null,
  requested: {},

  markHasTeam: () => set({ hasTeam: true }),

  load: (userId, releaseId) => {
    if (!userId) return;
    // Another person signed in on this tab: start clean.
    if (get().userId !== userId) {
      set({ userId, dismissed: new Set(readLocal(userId)), pitches: {}, hasTeam: null, requested: {} });
    }
    const key = requestKey(releaseId);
    if (get().requested[key]) return;
    set((state) => ({ requested: { ...state.requested, [key]: true } }));

    void (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const query = releaseId ? `?releaseId=${encodeURIComponent(releaseId)}` : '';
        const response = await fetch(`/api/next-moves${query}`, { headers, cache: 'no-store' });
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
        // Offline: the local copy is what there is.
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
