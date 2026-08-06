'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { CommandCenterData, ExecutionRelease, ExecutionTask } from '@/lib/execution-types';
import { useActivityStore } from '@/stores/useActivityStore';
import { useTaskStore } from '@/stores/useTaskStore';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

type ReleaseStore = {
  releases: ExecutionRelease[];
  todaysDirective: ExecutionTask | null;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  error: string;
  loadCommandCenter: (options?: { force?: boolean }) => Promise<CommandCenterData | null>;
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
        set({ isInitialLoading: false, isRefreshing: false, error: 'Session expired. Please sign in again.' });
        return null;
      }

      const response = await fetch('/api/command-center', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const payload = (await response.json().catch(() => ({}))) as Partial<CommandCenterData> & { error?: string };
      if (!response.ok || !Array.isArray(payload.releases)) {
        set({ isInitialLoading: false, isRefreshing: false, error: payload.error || 'Could not load releases.' });
        return null;
      }

      useTaskStore.getState().setTasks((payload.tasks || []) as CommandCenterData['tasks']);
      // Remember the roster size so the catalog skeleton can render THIS
      // user's shape on the next fresh load (see WorkspaceSkeleton).
      writePersistedState('urganize.workspace.release-count', 1, payload.releases.length);
      // Refresh the cache-first record for the next mount.
      if (sessionUserId) {
        writePersistedState<CommandCenterCache>(COMMAND_CENTER_CACHE_KEY, COMMAND_CENTER_CACHE_VERSION, {
          userId: sessionUserId,
          releases: payload.releases,
          tasks: (payload.tasks || []) as ExecutionTask[],
          todaysDirective: payload.todaysDirective || null,
        });
      }
      useActivityStore.getState().setActivity(payload.activity || []);
      commandCenterLoadedAt = Date.now();
      set({ releases: payload.releases, todaysDirective: payload.todaysDirective || null, isInitialLoading: false, isRefreshing: false, error: '' });
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

    const payload = (await response.json().catch(() => ({}))) as { releaseId?: string; templatePending?: boolean; release?: { title?: string; artistId?: string; artistName?: string; releaseDate?: string | null }; error?: string };
    if (!response.ok || !payload.releaseId) {
      set({ error: payload.error || 'Could not create release.' });
      return null;
    }

    const release: ExecutionRelease = {
      id: payload.releaseId,
      title: payload.release?.title || title,
      artistId: payload.release?.artistId || '',
      artistName: payload.release?.artistName || 'New Artist',
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
    const taskStore = useTaskStore.getState();
    taskStore.setTasks(taskStore.tasks.filter((task) => task.releaseId !== releaseId));
    set((current) => ({
      releases: current.releases.filter((release) => release.id !== releaseId),
      todaysDirective:
        current.todaysDirective?.releaseId === releaseId ? null : current.todaysDirective,
    }));
  },
}));
