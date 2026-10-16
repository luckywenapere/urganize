'use client';

import { registerSignOutReset } from '@/lib/sign-out-resets';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { applyKitToRoster } from '@/lib/press-kits';
import { isNetworkFailure } from '@/lib/offline/network-error';
import type { PressKit, PressKitRosterEntry } from '@/types/press-kits';

/**
 * The artist roster behind the press kits tab.
 *
 * WHY THIS EXISTS (founder report, 2026-09-05: "it's always reloading anytime I
 * open the tab"). Both press kit screens held their roster in local component
 * state and fetched it in a mount effect, so every visit started from an empty
 * list with `isLoading` true — three pulsing cards and a round trip, every
 * time, even when nothing had changed since ten seconds ago. The route chunk is
 * prefetched (lib/prefetch-routes.ts), so the code was already warm and the
 * data was the only thing missing.
 *
 * Mechanics are useNotesStore's, which are useWorkspaceIdentityStore's: a
 * recency guard, in-flight coalescing, cache-first paint keyed to the session
 * user, and `{ force: true }` for the callers that need server truth back.
 *
 * SAFE TO PERSIST, and that is a per-payload judgement rather than a default.
 * This roster is metadata only — artist id, name, and the kit's id, slug, state
 * and timestamps. It carries no signed URL, so unlike the files, song and
 * capture scenes there is nothing here that expires into a broken paint. The
 * single-kit payload is a different matter: its photos carry signed URLs on a
 * one-hour TTL, so that one is deliberately NOT cached here.
 */

type PressKitsStore = {
  entries: PressKitRosterEntry[];
  hydrated: boolean;
  /** True until the first load settles. Gates the tab's skeleton, so a later
   *  visit renders cached rows instead of placeholders. */
  isInitialLoading: boolean;
  /** Set when a load failed. The tab shows it as a blocking box when there is
   *  nothing to display and as a banner over cached rows when there is — the
   *  CuratorLoadError split. */
  error: string | null;
  load: (options?: { force?: boolean }) => Promise<void>;
  /** Fold a kit the single-kit screen just loaded back into the roster, so a
   *  create or a publish shows on the tab without a second round trip. */
  syncKit: (kit: PressKit) => void;
};

const PRESS_KITS_FRESH_MS = 15_000;
let pressKitsLoadedAt = 0;
let pressKitsInFlight: Promise<void> | null = null;

const CACHE_KEY = 'urganize.cache.press-kits';
const CACHE_VERSION = 1;

type PressKitsCache = {
  userId: string;
  entries: PressKitRosterEntry[];
};

const isPressKitsCache = (value: unknown): value is PressKitsCache => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.userId === 'string' && Array.isArray(record.entries);
};

async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    accessToken: session?.access_token || '',
    userId: session?.user?.id || '',
  };
}

// writePersistedState does not guard setItem, which throws on a full quota and
// in Safari's private mode. This runs inside an async store action, where an
// uncaught throw becomes an unhandled rejection. A cache miss costs one
// skeleton; a crash costs the page.
function cacheEntries(userId: string, entries: PressKitRosterEntry[]) {
  if (!userId) return;
  try {
    writePersistedState<PressKitsCache>(CACHE_KEY, CACHE_VERSION, { userId, entries });
  } catch {
    // Ignore: the next load repaints from the network.
  }
}

export const usePressKitsStore = create<PressKitsStore>((set, get) => ({
  entries: [],
  hydrated: false,
  isInitialLoading: true,
  error: null,
  load: async (options) => {
    if (!options?.force) {
      if (pressKitsInFlight) return pressKitsInFlight;
      if (get().hydrated && Date.now() - pressKitsLoadedAt < PRESS_KITS_FRESH_MS) return;
    }

    const run = (async () => {
      const { accessToken, userId } = await getSession();

      // Cache-first paint: last known roster on screen immediately, corrected
      // by the fetch below.
      if (!get().hydrated) {
        const cached = userId
          ? readPersistedState<PressKitsCache>(CACHE_KEY, CACHE_VERSION, isPressKitsCache)
          : null;
        if (cached && cached.userId === userId) {
          set({ entries: cached.entries, hydrated: true, isInitialLoading: false });
        }
      }

      if (!accessToken) {
        set({ isInitialLoading: false });
        return;
      }

      try {
        const response = await fetch('/api/press-kits', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          set({ error: body?.error || 'Could not load press kits.' });
          return;
        }

        const payload = (await response.json().catch(() => null)) as {
          entries?: PressKitRosterEntry[];
        } | null;
        if (!payload || !Array.isArray(payload.entries)) return;

        cacheEntries(userId, payload.entries);
        pressKitsLoadedAt = Date.now();
        set({ entries: payload.entries, hydrated: true, error: null });
      } catch (error) {
        // Offline or a dropped connection: keep whatever roster is painted
        // rather than turning this into an unhandled rejection at every
        // `void load()` call site. A real bug still surfaces.
        if (!isNetworkFailure(error)) throw error;
        set({ error: 'Could not load press kits. Check your connection and try again.' });
      } finally {
        set({ isInitialLoading: false });
      }
    })();

    pressKitsInFlight = run;
    try {
      await run;
    } finally {
      if (pressKitsInFlight === run) pressKitsInFlight = null;
    }
  },
  syncKit: (kit) => {
    const { entries } = get();
    const next = applyKitToRoster(entries, kit);
    // applyKitToRoster returns the same array when nothing matched, so an
    // unknown artist costs no render and no cache write.
    if (next === entries) return;
    set({ entries: next });
    void getSession().then(({ userId }) => cacheEntries(userId, next));
  },
}));

/** Called on sign-out, beside the other per-user caches, so the next account
 *  on this device never paints the previous one's roster. */
export function resetPressKitsStore() {
  pressKitsLoadedAt = 0;
  pressKitsInFlight = null;
  usePressKitsStore.setState({
    entries: [],
    hydrated: false,
    isInitialLoading: true,
    error: null,
  });
}

// Sign-out: see lib/sign-out-resets.ts (runs from lib/auth-store.ts).
registerSignOutReset('press-kits', resetPressKitsStore);
