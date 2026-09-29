'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { CommandCenterData, ExecutionRelease, ExecutionTask } from '@/lib/execution-types';
import { useActivityStore } from '@/stores/useActivityStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import { useSceneDataStore } from '@/stores/useSceneDataStore';
import { isDbReleaseType } from '@/types/releases';
import { isNetworkFailure } from '@/lib/offline/network-error';

type ReleaseStore = {
  releases: ExecutionRelease[];
  todaysDirective: ExecutionTask | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: string;
  loadCommandCenter: (options?: { force?: boolean }) => Promise<CommandCenterData | null>;
  /**
   * Applies a command-center-SHAPED payload obtained from somewhere OTHER
   * than /api/command-center — today, /api/home, whose response already
   * embeds the same {releases, tasks, activity, todaysDirective} the catalog
   * needs. Shares loadCommandCenter's in-flight slot, so a concurrent
   * non-forced loadCommandCenter() call (e.g. WorkspaceIdentityPanel's own
   * mount-time load) piggybacks on THIS request instead of firing a second
   * /api/command-center fetch — the reason a navigation from Home to the
   * catalog costs no second round trip. `fetchData` is expected to return
   * null on a handled failure (never throw for a network blip); the store's
   * own error/loading state is set exactly as loadCommandCenter's is.
   */
  loadCommandCenterVia: (fetchData: () => Promise<CommandCenterData | null>) => Promise<CommandCenterData | null>;
  createRelease: (title: string) => Promise<ExecutionRelease | null>;
  /** Drops a release (and its tasks) from local state after the server
   * confirmed deletion. The caller is expected to follow up with
   * loadCommandCenter() to re-sync. */
  removeReleaseLocal: (releaseId: string) => void;
};

const getAccessToken = async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
};

// Recency guard for loadCommandCenter. Every route-level mount used to
// re-download the entire payload (all releases + all tasks + activity), so
// dashboard -> release detail -> back re-pulled everything on each leg.
// Within this window a mount renders straight from the hydrated store;
// mutation refreshes pass { force: true } and always hit the network.
// Non-forced calls made while a load is already in flight piggyback on that
// load's promise instead of firing a concurrent duplicate fetch (e.g. the
// caller's follow-up refresh right after CreateReleaseModal's forced resync).
const COMMAND_CENTER_FRESH_MS = 10_000;
let commandCenterLoadedAt = 0;
let commandCenterInFlight: Promise<CommandCenterData | null> | null = null;

// Stale-response guard, shared by loadCommandCenter and loadCommandCenterVia.
// Each run captures the sequence number current when IT started; if a NEWER
// run has since started by the time this one is ready to apply its result,
// this one's data is silently dropped rather than overwriting whatever the
// newer run will (or already did) write. Without this, an older, slower
// response landing after a newer forced refresh could revert the screen to
// stale data for a frame.
let commandCenterRunSeq = 0;

// Cache-first hydration (founder call, 2026-07-23: "persistent state
// throughout the app, like a proper mobile app"). The last successful
// command-center payload is persisted; a fresh mount renders it INSTANTLY
// (no skeleton) while the network fetch continues as a silent background
// refresh. Keyed to the owning user so an account switch on the same device
// never shows someone else's roster. Activity is deliberately excluded to
// keep the record small — no mounted surface renders it before the refresh.
const COMMAND_CENTER_CACHE_KEY = 'urganize.cache.command-center';
const COMMAND_CENTER_CACHE_VERSION = 1;

type CommandCenterCache = {
  userId: string;
  releases: ExecutionRelease[];
  tasks: ExecutionTask[];
  todaysDirective: ExecutionTask | null;
};

const isCommandCenterCache = (value: unknown): value is CommandCenterCache => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.userId === 'string' &&
    Array.isArray(record.releases) &&
    Array.isArray(record.tasks)
  );
};

/**
 * Merges a freshly-fetched task list against what's already in useTaskStore,
 * keeping the CURRENT (optimistic) row for any task whose complete/reopen
 * PATCH is still in flight. Without this, a background refresh resolving
 * mid-tick would blind-overwrite an optimistic completion with the
 * pre-completion row the server captured before (or racing) the PATCH — the
 * checkbox would visibly un-tick itself. Home's initial load is another
 * source of exactly this kind of background refresh, which is why this
 * guard is shared by both apply paths rather than being Home-specific.
 */
function mergeIncomingTasks(incoming: ExecutionTask[]): ExecutionTask[] {
  if (!incoming.length) return incoming;
  const taskStore = useTaskStore.getState();
  const currentById = new Map(taskStore.tasks.map((task) => [task.id, task]));
  return incoming.map((task) => {
    if (taskStore.hasInFlightCompletion(task.id)) {
      const current = currentById.get(task.id);
      if (current) return current;
    }
    return task;
  });
}

/** The success-path apply: writes tasks/activity/releases/cache, guarded by
 *  the sequence check above. Shared by loadCommandCenter and
 *  loadCommandCenterVia so both get the same stale-response and
 *  mid-tick protections. */
function applyCommandCenterData(
  set: (partial: Partial<ReleaseStore>) => void,
  data: CommandCenterData,
  sessionUserId: string,
  mySeq: number
): void {
  useTaskStore.getState().setTasks(mergeIncomingTasks(data.tasks || []));
  // Remember the roster size so the catalog skeleton can render THIS user's
  // shape on the next fresh load (see WorkspaceSkeleton).
  writePersistedState('urganize.workspace.release-count', 1, data.releases.length);
  if (sessionUserId) {
    writePersistedState<CommandCenterCache>(COMMAND_CENTER_CACHE_KEY, COMMAND_CENTER_CACHE_VERSION, {
      userId: sessionUserId,
      releases: data.releases,
      tasks: data.tasks || [],
      todaysDirective: data.todaysDirective ?? null,
    });
  }
  useActivityStore.getState().setActivity(data.activity || []);
  commandCenterLoadedAt = Date.now();

  if (mySeq !== commandCenterRunSeq) {
    // A newer run has since started; that one owns the final applied state.
    // isInitialLoading/isRefreshing are left for the newer run to clear.
    return;
  }
  set({ releases: data.releases, todaysDirective: data.todaysDirective ?? null, isInitialLoading: false, isRefreshing: false, error: '' });
}

export const useReleaseStore = create<ReleaseStore>((set, get) => ({
  releases: [],
  todaysDirective: null,
  // Default true so the in-component `if (authLoading || isInitialLoading)
  // return null;` guard in WorkspaceView / release-detail / LegacyDashboard
  // stays active during the brief window between auth-resolve and the first
  // `loadCommandCenter()` call. Without this, an unauthenticated visitor
  // would briefly see the empty workspace state before the redirect fires.
  // After the first load completes, this flips to false and stays false
  // (in-app re-navigations route through `isRefreshing` instead).
  isInitialLoading: true,
  isRefreshing: false,
  error: '',
  loadCommandCenter: async (options) => {
    if (!options?.force) {
      if (commandCenterInFlight) {
        return commandCenterInFlight;
      }
      if (
        get().releases.length > 0 &&
        Date.now() - commandCenterLoadedAt < COMMAND_CENTER_FRESH_MS
      ) {
        return null;
      }
    }

    const mySeq = ++commandCenterRunSeq;

    const run = (async (): Promise<CommandCenterData | null> => {
      // Session first: its user id keys the cache. The AUTH STORE's user is
      // deliberately not used here — the first load often races the store's
      // profile hydration (the Supabase session is readable immediately,
      // the profile isn't), and keying off it silently skipped the cache.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token || '';
      const sessionUserId = session?.user?.id || '';

      const hasData = get().releases.length > 0;
      if (!hasData) {
        // Cache-first: hydrate the last-known payload for THIS user so the
        // UI paints immediately; the fetch below becomes a silent refresh.
        const cached = sessionUserId
          ? readPersistedState<CommandCenterCache>(
              COMMAND_CENTER_CACHE_KEY,
              COMMAND_CENTER_CACHE_VERSION,
              isCommandCenterCache
            )
          : null;
        if (cached && cached.userId === sessionUserId && cached.releases.length > 0) {
          useTaskStore.getState().setTasks(cached.tasks);
          set({
            releases: cached.releases,
            todaysDirective: cached.todaysDirective ?? null,
            isInitialLoading: false,
            isRefreshing: true,
            error: '',
          });
        } else {
          set({ isInitialLoading: true, error: '' });
        }
      } else {
        set({ isRefreshing: true, error: '' });
      }

      if (!accessToken) {
        // Silent: this now runs on mount WITHOUT waiting for the auth store
        // (so the request races the GoTrue chain instead of queuing behind
        // it), which means "no session yet" is a normal state here, not an
        // error. The page's own auth effect owns the /auth redirect — showing
        // "Session expired" would just flash a wrong message on the way out.
        set({ isRefreshing: false });
        return null;
      }

      let response: Response;
      try {
        response = await fetch('/api/command-center', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
      } catch (fetchError) {
        // Offline / DNS / a dropped connection — never a rejected promise
        // out of loadCommandCenter: every caller is `void`d, so a throw here
        // was an unhandled rejection and, on a cache miss, a permanent
        // skeleton. Keep whatever is already painted (cached or in-memory);
        // only show an error when there is truly nothing on screen.
        if (isNetworkFailure(fetchError)) {
          set((state) => ({
            isInitialLoading: false,
            isRefreshing: false,
            error: state.releases.length > 0 ? '' : "You're offline. Reconnect to load your rollouts.",
          }));
          return null;
        }
        throw fetchError;
      }
      const payload = (await response.json().catch(() => ({}))) as Partial<CommandCenterData> & { error?: string };
      if (!response.ok || !Array.isArray(payload.releases)) {
        set({ isInitialLoading: false, isRefreshing: false, error: payload.error || 'Could not load rollouts.' });
        return null;
      }

      applyCommandCenterData(set, payload as CommandCenterData, sessionUserId, mySeq);
      return payload as CommandCenterData;
    })();

    commandCenterInFlight = run;
    try {
      return await run;
    } finally {
      if (commandCenterInFlight === run) {
        commandCenterInFlight = null;
      }
    }
  },
  loadCommandCenterVia: async (fetchData) => {
    // Deliberately does NOT piggyback on an in-flight `commandCenterInFlight`
    // the way loadCommandCenter does. That early-return is safe ONLY when
    // the in-flight run is itself carrying whatever this caller needs — true
    // for a plain loadCommandCenter() piggybacking on a Via run (Via's
    // payload is a strict superset), but false in reverse: a Via caller
    // needs its own side-payload (today, /api/home's `home` field), which a
    // plain /api/command-center response can never contain. Returning the
    // OTHER call's promise here meant `fetchData` was simply never invoked
    // whenever AppShell's or WorkspaceIdentityPanel's mount-time
    // loadCommandCenter() won the race — silently starving useHomeStore of
    // its /api/home response and leaving HomePageClient on its skeleton
    // forever (it never reads useReleaseStore's `error`, and this store's
    // own loading state cleared normally, so nothing looked stuck from the
    // outside). Always running its own fetch keeps the one-directional
    // optimization the comment above describes (a normal loadCommandCenter()
    // call still piggybacks on an in-flight Via run) without the unsafe
    // reverse case.
    const mySeq = ++commandCenterRunSeq;
    const hasData = get().releases.length > 0;
    set(hasData ? { isRefreshing: true, error: '' } : { isInitialLoading: true, error: '' });

    const run = (async (): Promise<CommandCenterData | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const sessionUserId = session?.user?.id || '';

      let data: CommandCenterData | null;
      try {
        data = await fetchData();
      } catch (fetchError) {
        if (isNetworkFailure(fetchError)) {
          set((state) => ({
            isInitialLoading: false,
            isRefreshing: false,
            error: state.releases.length > 0 ? '' : "You're offline. Reconnect to load your rollouts.",
          }));
          return null;
        }
        throw fetchError;
      }

      if (!data) {
        if (mySeq === commandCenterRunSeq) {
          set({ isInitialLoading: false, isRefreshing: false });
        }
        return null;
      }

      applyCommandCenterData(set, data, sessionUserId, mySeq);
      return data;
    })();

    commandCenterInFlight = run;
    try {
      return await run;
    } finally {
      if (commandCenterInFlight === run) {
        commandCenterInFlight = null;
      }
    }
  },
  createRelease: async (title) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      set({ error: 'Session expired. Please sign in again.' });
      return null;
    }

    const response = await fetch('/api/releases', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        title,
        // No artistName: server uses the workspace's artist when the
        // NEXT_PUBLIC_FEATURE_WORKSPACE flag is on (Phase 3), and falls back
        // to the legacy default-artist path when the flag is off.
        releaseDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10),
        source: 'dashboard',
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as { releaseId?: string; templatePending?: boolean; release?: { title?: string; artistId?: string; artistName?: string; releaseType?: string; releaseDate?: string | null }; error?: string };
    if (!response.ok || !payload.releaseId) {
      set({ error: payload.error || 'Could not create rollout.' });
      return null;
    }

    const release: ExecutionRelease = {
      id: payload.releaseId,
      title: payload.release?.title || title,
      artistId: payload.release?.artistId || '',
      artistName: payload.release?.artistName || 'New Artist',
      // This quick-create path sends no type, so the server stores 'single';
      // read the echo anyway rather than assuming, so the two cannot drift.
      releaseType: isDbReleaseType(payload.release?.releaseType)
        ? payload.release.releaseType
        : 'single',
      releaseDate: payload.release?.releaseDate || null,
      description: null,
      // Echoed from the create response (URG-230) so the optimistic row
      // agrees with the server about whether a rollout plan is still waiting
      // on a date — the activities view picks its card variant from this.
      templatePending: payload.templatePending === true,
      status: 'draft',
      state: 'idea',
      readinessScore: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerUserId: '',
      metadata: {},
    };
    set((current) => ({ releases: [release, ...current.releases], error: '' }));
    useActivityStore.getState().addLocalActivity({
      releaseId: release.id,
      taskId: null,
      actorName: 'You',
      action: 'created_release',
      message: `Created ${release.title}`,
    });
    return release;
  },
  removeReleaseLocal: (releaseId) => {
    // Its cached scenes (metadata / files / press kit / calendar) go with it —
    // otherwise a re-created release reusing the id, or just a stale disk
    // entry, could paint a deleted release's data.
    useSceneDataStore.getState().invalidate(releaseId);
    const taskStore = useTaskStore.getState();
    taskStore.setTasks(taskStore.tasks.filter((task) => task.releaseId !== releaseId));
    set((current) => ({
      releases: current.releases.filter((release) => release.id !== releaseId),
      todaysDirective:
        current.todaysDirective?.releaseId === releaseId ? null : current.todaysDirective,
    }));
  },
}));

/**
 * Forget the signed-in account's rollouts and today's directive. Called on
 * SIGNED_OUT (lib/auth-store.ts) — the same exposure as resetPressKitsStore /
 * resetArtistRosterStore / resetEventsStore: this store is module-level, so a
 * client-side navigation to /auth never tears it down, and within
 * COMMAND_CENTER_FRESH_MS the recency guard would otherwise skip the next
 * account's load and leave account A's catalog on screen for account B. The
 * disk cache needs no clearing here — it is already keyed by session user id
 * and a mismatched read is ignored (see isCommandCenterCache above).
 */
export function resetReleaseStore(): void {
  commandCenterLoadedAt = 0;
  commandCenterInFlight = null;
  useReleaseStore.setState({
    releases: [],
    todaysDirective: null,
    isInitialLoading: true,
    isRefreshing: false,
    error: '',
  });
}
