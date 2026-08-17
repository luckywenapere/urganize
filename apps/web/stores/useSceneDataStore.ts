import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import {
  SCENE_CACHE_KEY,
  SCENE_CACHE_VERSION,
  SCENE_PREFETCH_ORDER,
  isSceneCachePayload,
  isSceneFresh,
  isSceneRenderable,
  sceneEntryKey,
  shouldPersistScene,
  trimSceneCacheEntries,
  withinPersistBudget,
  type SceneCacheEntry,
  type SceneCachePayload,
  type CacheableSceneName,
  type SceneName,
} from '@/lib/scene-cache';
import { shouldBackgroundPrefetch } from '@/lib/connection';
import type { ReleaseMetadataSnapshot } from '@/lib/release-ops';
import type { ReleaseCreditLink, ReleaseCreditSubmission } from '@/types/credits';
import type { ReleaseEpk } from '@/types/epk';
import type { ContentCalendar } from '@/types/content-calendar';
import type { SentPitch } from '@/types/pitching';
import type { ReleaseCaptureLead, ReleaseCapturePage } from '@/types/capture';
import type { ReleaseSong } from '@/types/song';
import type { ReleaseCoverArt } from '@/types/cover-art';
import type { Asset } from '@/components/releases/AssetSection';

/**
 * Cache + background-prefetch layer for the four release scenes.
 *
 * Follows the house triple-guard pattern (useReleaseStore.loadCommandCenter,
 * useWorkspaceIdentityStore.load): in-flight dedup, a recency window, and
 * cache-first hydration so a warm open paints with no spinner and the fetch
 * becomes a silent background refresh.
 *
 * The prefetch half is what makes the scene pills feel free: once a release is
 * scoped in the workspace, the four scenes warm during idle time while the user
 * reads the activity list, so the pill they eventually tap is already loaded.
 * Bounded by shouldBackgroundPrefetch() — on Data Saver or a 2g link we spend
 * nothing speculatively (see lib/connection.ts for why that matters here).
 *
 * Cache policy (what may be stored, for how long) lives in lib/scene-cache.ts.
 */

export type MetadataScenePayload = {
  metadata: ReleaseMetadataSnapshot | null;
  link: ReleaseCreditLink | null;
  submissions: ReleaseCreditSubmission[];
};

export type FilesScenePayload = { assets: Asset[] };
export type EpkScenePayload = { epk: ReleaseEpk | null };
export type CalendarScenePayload = { calendars: ContentCalendar[] };
export type PitchScenePayload = { pitches: SentPitch[] };
export type CaptureScenePayload = {
  page: ReleaseCapturePage | null;
  /** The most recent leads, capped server-side (CAPTURE_LEADS_PAGE_SIZE). */
  leads: ReleaseCaptureLead[];
  /** The true total, which can exceed leads.length. */
  leadCount: number;
  /** Whether the public page will render an image, resolved server-side so the
   * playbook checklist grades what a fan actually sees. */
  hasGraphic: boolean;
};

/** Newest first, so `songs[0]` is "the current song" without anything having
 * to store which one that is. */
export type SongScenePayload = { songs: ReleaseSong[] };

/** A release has at most one current cover art, unlike songs — so this is a
 * single nullable slot rather than a list. */
export type CoverArtScenePayload = { coverArt: ReleaseCoverArt | null };

export type ScenePayloadMap = {
  metadata: MetadataScenePayload;
  files: FilesScenePayload;
  song: SongScenePayload;
  coverart: CoverArtScenePayload;
  epk: EpkScenePayload;
  calendar: CalendarScenePayload;
  pitch: PitchScenePayload;
  capture: CaptureScenePayload;
};

type SceneStateEntry = {
  data: unknown;
  savedAt: number;
  isRefreshing: boolean;
};

type SceneDataStore = {
  entries: Record<string, SceneStateEntry>;
  /** Cached payload for a scene, or null when nothing renderable is held.
   * Reads memory first, then falls back to (and adopts) the persisted copy. */
  getScene: <S extends CacheableSceneName>(releaseId: string, scene: S) => ScenePayloadMap[S] | null;
  loadScene: <S extends CacheableSceneName>(
    releaseId: string,
    scene: S,
    options?: { force?: boolean; prefetch?: boolean }
  ) => Promise<ScenePayloadMap[S] | null>;
  /** Write-through after a mutation, so the next open reflects the change
   * without a round trip. */
  setScene: <S extends CacheableSceneName>(
    releaseId: string,
    scene: S,
    data: ScenePayloadMap[S]
  ) => void;
  /** Drop cached scenes — one scene, one whole release, or (no args) all of
   * them. Called on release deletion and on sign-out. */
  invalidate: (releaseId?: string, scene?: SceneName) => void;
  prefetchRelease: (releaseId: string) => Promise<void>;
};

/** In-flight requests keyed by `${releaseId}:${scene}`; module-level so
 * concurrent callers (a prefetch and a real open racing) share one request. */
const inFlight = new Map<string, Promise<unknown>>();
/** Session user id — the persisted cache is per-account and is discarded
 * wholesale on a mismatch. */
let cachedUserId = primeCachedUserId();

/**
 * Read the account id from the auth store's persisted blob at module load.
 *
 * Without this the disk cache is dead weight on a fresh page load: nothing
 * knows whose data is on disk until supabase.auth.getSession() resolves, which
 * is well after the first render — so a reload would always re-fetch all four
 * scenes even though a valid copy was sitting there. Reading the blob directly
 * (rather than importing useAuthStore) is deliberate: the auth store imports
 * resetSceneData from this module, and a real import cycle between two
 * module-scope stores is not worth the tidiness.
 *
 * This only unlocks READS of data this browser already stored for this
 * account. The id is re-confirmed against the live session on the first
 * loadScene, which discards the cache on any mismatch.
 */
function primeCachedUserId(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem('urganize-auth');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { state?: { user?: { id?: unknown } } };
    const id = parsed?.state?.user?.id;
    return typeof id === 'string' ? id : '';
  } catch {
    return '';
  }
}

async function getSession(): Promise<{ token: string; userId: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return { token: session?.access_token || '', userId: session?.user?.id || '' };
}

function readCachePayload(userId: string): SceneCachePayload | null {
  if (!userId) return null;
  const cached = readPersistedState<SceneCachePayload>(
    SCENE_CACHE_KEY,
    SCENE_CACHE_VERSION,
    isSceneCachePayload
  );
  if (!cached || cached.userId !== userId) return null;
  return cached;
}

function writeCacheEntry(userId: string, entryKey: string, entry: SceneCacheEntry): void {
  if (!userId) return;
  try {
    const existing = readCachePayload(userId);
    const entries = trimSceneCacheEntries({
      ...(existing?.entries || {}),
      [entryKey]: entry,
    });
    const payload: SceneCachePayload = { userId, entries };
    // Budget check BEFORE the write: localStorage.setItem throws
    // QuotaExceededError, and an unguarded throw here would surface as a
    // failed scene load rather than the harmless "we skipped the cache" it is.
    if (!withinPersistBudget(JSON.stringify(payload))) return;
    writePersistedState(SCENE_CACHE_KEY, SCENE_CACHE_VERSION, payload);
  } catch {
    // Storage full or blocked (private mode) — the memory cache still works.
  }
}

function rewriteCache(mutate: (entries: Record<string, SceneCacheEntry>) => Record<string, SceneCacheEntry>): void {
  if (!cachedUserId) return;
  try {
    const existing = readCachePayload(cachedUserId);
    if (!existing) return;
    writePersistedState<SceneCachePayload>(SCENE_CACHE_KEY, SCENE_CACHE_VERSION, {
      userId: cachedUserId,
      entries: mutate(existing.entries),
    });
  } catch {
    // Non-fatal — see writeCacheEntry.
  }
}

type SceneFetcher = (releaseId: string, token: string, prefetch: boolean) => Promise<unknown>;

/** Prefetch requests carry this so lib/access-redirect.ts's global 402
 * interceptor can ignore them: a speculative request must never be able to
 * navigate the user away from the page they're reading. */
const PREFETCH_HEADER = 'X-Urganize-Prefetch';

function requestInit(token: string, prefetch: boolean): RequestInit {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (prefetch) headers[PREFETCH_HEADER] = '1';
  return { headers, cache: 'no-store' };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Request failed.');
  }
  return data;
}

const FETCHERS: Record<CacheableSceneName, SceneFetcher> = {
  // Two independent endpoints — the section used to fire them as two separate
  // mount effects, so they raced rather than being deliberately parallel; this
  // makes the pairing explicit and lets the scene resolve in one round trip.
  metadata: async (releaseId, token, prefetch) => {
    const [metadataRes, creditsRes] = await Promise.all([
      fetch(`/api/releases/${releaseId}/metadata`, requestInit(token, prefetch)),
      fetch(`/api/releases/${releaseId}/credits`, requestInit(token, prefetch)),
    ]);
    const [metadataJson, creditsJson] = await Promise.all([
      readJson(metadataRes),
      readJson(creditsRes),
    ]);
    return {
      metadata: (metadataJson.metadata as ReleaseMetadataSnapshot | null) ?? null,
      link: (creditsJson.link as ReleaseCreditLink | null) ?? null,
      submissions: Array.isArray(creditsJson.submissions)
        ? (creditsJson.submissions as ReleaseCreditSubmission[])
        : [],
    } satisfies MetadataScenePayload;
  },
  files: async (releaseId, token, prefetch) => {
    const data = await readJson(
      await fetch(`/api/releases/${releaseId}/assets`, requestInit(token, prefetch))
    );
    return {
      assets: Array.isArray(data.assets) ? (data.assets as Asset[]) : [],
    } satisfies FilesScenePayload;
  },
  song: async (releaseId, token, prefetch) => {
    const data = await readJson(
      await fetch(`/api/releases/${releaseId}/song`, requestInit(token, prefetch))
    );
    return {
      songs: Array.isArray(data.songs) ? (data.songs as ReleaseSong[]) : [],
    } satisfies SongScenePayload;
  },
  coverart: async (releaseId, token, prefetch) => {
    const data = await readJson(
      await fetch(`/api/releases/${releaseId}/cover-art`, requestInit(token, prefetch))
    );
    return {
      coverArt: (data.coverArt as ReleaseCoverArt | null) ?? null,
    } satisfies CoverArtScenePayload;
  },
  epk: async (releaseId, token, prefetch) => {
    const data = await readJson(
      await fetch(`/api/releases/${releaseId}/epk`, requestInit(token, prefetch))
    );
    return { epk: (data.epk as ReleaseEpk | null) ?? null } satisfies EpkScenePayload;
  },
  calendar: async (releaseId, token, prefetch) => {
    const data = await readJson(
      await fetch(`/api/releases/${releaseId}/content-calendars`, requestInit(token, prefetch))
    );
    return {
      calendars: Array.isArray(data.calendars) ? (data.calendars as ContentCalendar[]) : [],
    } satisfies CalendarScenePayload;
  },
  // Only the pitches already sent for this release. The playlist inventory is
  // global, so the composer fetches it on demand rather than caching it per
  // release.
  pitch: async (releaseId, token, prefetch) => {
    const data = await readJson(
      await fetch(
        `/api/pitching/pitches?releaseId=${encodeURIComponent(releaseId)}`,
        requestInit(token, prefetch)
      )
    );
    return {
      pitches: Array.isArray(data.pitches) ? (data.pitches as SentPitch[]) : [],
    } satisfies PitchScenePayload;
  },
  capture: async (releaseId, token, prefetch) => {
    const data = await readJson(
      await fetch(`/api/releases/${releaseId}/capture`, requestInit(token, prefetch))
    );
    return {
      page: (data.page as ReleaseCapturePage | null) ?? null,
      leads: Array.isArray(data.leads) ? (data.leads as ReleaseCaptureLead[]) : [],
      leadCount: typeof data.leadCount === 'number' ? data.leadCount : 0,
      hasGraphic: data.hasGraphic === true,
    } satisfies CaptureScenePayload;
  },
};

export const useSceneDataStore = create<SceneDataStore>((set, get) => ({
  entries: {},

  getScene: <S extends CacheableSceneName>(releaseId: string, scene: S) => {
    if (!releaseId) return null;
    const key = sceneEntryKey(releaseId, scene);
    const now = Date.now();

    const held = get().entries[key];
    if (held && isSceneRenderable(scene, held.savedAt, now)) {
      return held.data as ScenePayloadMap[S];
    }

    // Nothing usable in memory — adopt the persisted copy if this scene is
    // allowed one and it's still young enough to paint.
    if (!shouldPersistScene(scene) || !cachedUserId) return null;
    const cached = readCachePayload(cachedUserId);
    const entry = cached?.entries[key];
    if (!entry || !isSceneRenderable(scene, entry.savedAt, now)) return null;
    return entry.data as ScenePayloadMap[S];
  },

  loadScene: async <S extends CacheableSceneName>(
    releaseId: string,
    scene: S,
    options?: { force?: boolean; prefetch?: boolean }
  ) => {
    if (!releaseId) return null;
    const key = sceneEntryKey(releaseId, scene);
    const now = Date.now();

    if (!options?.force) {
      const existing = inFlight.get(key);
      if (existing) return existing as Promise<ScenePayloadMap[S] | null>;

      const held = get().entries[key];
      // Fresh enough to skip the network entirely. Re-opening the same scene
      // within the window costs zero requests, which is the whole point.
      if (held && isSceneFresh(held.savedAt, now) && isSceneRenderable(scene, held.savedAt, now)) {
        return held.data as ScenePayloadMap[S];
      }

      // Nothing in memory, but disk may hold a still-fresh copy from seconds
      // ago (a page reload, or a second tab). Adopting it here is what stops
      // a refresh from re-spending data on all four scenes.
      if (!held && shouldPersistScene(scene) && cachedUserId) {
        const persisted = readCachePayload(cachedUserId)?.entries[key];
        if (persisted && isSceneFresh(persisted.savedAt, now)) {
          set((state) => ({
            entries: {
              ...state.entries,
              [key]: { data: persisted.data, savedAt: persisted.savedAt, isRefreshing: false },
            },
          }));
          return persisted.data as ScenePayloadMap[S];
        }
      }
    }

    const run = (async (): Promise<ScenePayloadMap[S] | null> => {
      const { token, userId } = await getSession();
      if (userId && userId !== cachedUserId) {
        // The primed id disagreed with the live session (a stale auth blob, or
        // an account switch that skipped SIGNED_OUT). Anything read on the
        // primed id's authority is now suspect — drop it all before going on.
        if (cachedUserId) get().invalidate();
        cachedUserId = userId;
      }
      // No session yet: the page's own auth effect owns the redirect. Returning
      // null (rather than throwing) keeps a warm cached paint on screen.
      if (!token) return null;

      set((state) => ({
        entries: {
          ...state.entries,
          [key]: {
            data: state.entries[key]?.data ?? null,
            savedAt: state.entries[key]?.savedAt ?? 0,
            isRefreshing: true,
          },
        },
      }));

      try {
        const data = await FETCHERS[scene](releaseId, token, options?.prefetch === true);
        const savedAt = Date.now();
        set((state) => ({
          entries: { ...state.entries, [key]: { data, savedAt, isRefreshing: false } },
        }));
        if (shouldPersistScene(scene) && userId) {
          writeCacheEntry(userId, key, { savedAt, data });
        }
        return data as ScenePayloadMap[S];
      } catch (error) {
        set((state) => {
          const held = state.entries[key];
          if (!held) return state;
          return { entries: { ...state.entries, [key]: { ...held, isRefreshing: false } } };
        });
        throw error;
      }
    })();

    inFlight.set(key, run);
    try {
      return await run;
    } finally {
      inFlight.delete(key);
    }
  },

  setScene: <S extends CacheableSceneName>(releaseId: string, scene: S, data: ScenePayloadMap[S]) => {
    if (!releaseId) return;
    const key = sceneEntryKey(releaseId, scene);
    const savedAt = Date.now();
    set((state) => ({
      entries: { ...state.entries, [key]: { data, savedAt, isRefreshing: false } },
    }));
    if (shouldPersistScene(scene) && cachedUserId) {
      writeCacheEntry(cachedUserId, key, { savedAt, data });
    }
  },

  invalidate: (releaseId?: string, scene?: SceneName) => {
    const matches = (key: string) => {
      if (!releaseId) return true;
      return scene ? key === sceneEntryKey(releaseId, scene) : key.startsWith(`${releaseId}:`);
    };

    for (const key of Array.from(inFlight.keys())) {
      if (matches(key)) inFlight.delete(key);
    }

    set((state) => {
      const entries: Record<string, SceneStateEntry> = {};
      for (const [key, entry] of Object.entries(state.entries)) {
        if (!matches(key)) entries[key] = entry;
      }
      return { entries };
    });

    if (!releaseId) {
      // Full reset (sign-out): drop the persisted copy too, so the next
      // account in this tab can never paint the previous one's data.
      cachedUserId = '';
      try {
        window.localStorage.removeItem(SCENE_CACHE_KEY);
      } catch {
        // Blocked storage — memory is already cleared, which is what matters.
      }
      return;
    }

    rewriteCache((entries) => {
      const next: Record<string, SceneCacheEntry> = {};
      for (const [key, entry] of Object.entries(entries)) {
        if (!matches(key)) next[key] = entry;
      }
      return next;
    });
  },

  prefetchRelease: async (releaseId: string) => {
    if (!releaseId || !shouldBackgroundPrefetch()) return;
    // Sequential on purpose: four parallel requests would compete with
    // whatever the user is actually waiting for. This is speculative work —
    // it should use the gaps, not the pipe.
    for (const scene of SCENE_PREFETCH_ORDER) {
      try {
        await get().loadScene(releaseId, scene, { prefetch: true });
      } catch {
        // A scene that fails to prefetch simply isn't warm — the real open
        // will retry and surface the error properly there.
      }
    }
  },
}));

/** Clear everything. Called from the auth store on sign-out. */
export function resetSceneData(): void {
  useSceneDataStore.getState().invalidate();
}
