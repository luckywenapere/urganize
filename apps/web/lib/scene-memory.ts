import { readPersistedState, writePersistedState } from './persisted-state';
import type { SceneName } from './scene-cache';

// Remembers which scene (Metadata / Calendar / Song / …, or none = the
// default Activities list) each release was last showing, so navigating
// between releases in the SAME login session resumes each one where it was
// left — rather than today's behavior, where switching the scoped release
// via a rail-card click never touches the `scene` param at all, so whichever
// scene was open just leaks onto whichever release you land on next.
//
// Hooked into the two existing "the scoped release actually changed" choke
// points — useReleaseScope.setScope and useSceneOverlay.openScene — the same
// pair the content calendar's `calendar`/`month` memory already uses.
//
// Deliberately NO in-memory cache of its own (unlike
// stores/useSceneDataStore.ts's `cachedUserId`, primed once at module load):
// this module is read/written from inside plain URL-changing callbacks, not
// from a React component with a lifecycle to hook a subscription into. A
// value cached at module load would go stale across a same-tab logout→login
// cycle — writes would silently no-op (keyed to a zeroed id) until the next
// full page reload. Reading the session id fresh on every call costs one
// synchronous localStorage read + JSON parse, which is negligible next to a
// URL navigation.

const MEMORY_CACHE_KEY = 'urganize.cache.scene-memory';
const MEMORY_CACHE_VERSION = 1;

type SceneMemoryPayload = {
  userId: string;
  scenes: Record<string, SceneName>;
};

function isSceneMemoryPayload(value: unknown): value is SceneMemoryPayload {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SceneMemoryPayload>;
  if (typeof candidate.userId !== 'string' || !candidate.userId) return false;
  return Boolean(candidate.scenes) && typeof candidate.scenes === 'object';
}

/**
 * Read the CURRENT session's user id directly off the auth store's persisted
 * blob (the same trick stores/useSceneDataStore.ts's `primeCachedUserId`
 * uses) rather than importing useAuthStore — auth-store.ts calls this
 * module's `resetSceneMemory` on sign-out, and a real import cycle between
 * two module-scope stores is not worth the tidiness.
 */
function readSessionUserId(): string {
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

function readScenes(userId: string): Record<string, SceneName> {
  if (!userId) return {};
  const cached = readPersistedState<SceneMemoryPayload>(
    MEMORY_CACHE_KEY,
    MEMORY_CACHE_VERSION,
    isSceneMemoryPayload
  );
  if (!cached || cached.userId !== userId) return {};
  return cached.scenes;
}

/** What scene a release was last showing this session, or null for the
 * default Activities view (never visited this session, or its last state
 * WAS Activities). */
export function recallScene(releaseId: string): SceneName | null {
  if (!releaseId) return null;
  const userId = readSessionUserId();
  return readScenes(userId)[releaseId] ?? null;
}

/**
 * Record which scene a release is showing right now — called at the moment
 * the user is about to LEAVE it, capturing the OUTGOING release's current
 * scene before it's overwritten. `null` (Activities) deletes any existing
 * entry rather than storing a placeholder, so a release resting at
 * Activities costs nothing in the map.
 */
export function rememberScene(releaseId: string, scene: SceneName | null): void {
  if (!releaseId) return;
  const userId = readSessionUserId();
  if (!userId) return;

  try {
    const scenes = readScenes(userId);
    if (scene) {
      if (scenes[releaseId] === scene) return;
      writePersistedState<SceneMemoryPayload>(MEMORY_CACHE_KEY, MEMORY_CACHE_VERSION, {
        userId,
        scenes: { ...scenes, [releaseId]: scene },
      });
    } else if (releaseId in scenes) {
      const next = { ...scenes };
      delete next[releaseId];
      writePersistedState<SceneMemoryPayload>(MEMORY_CACHE_KEY, MEMORY_CACHE_VERSION, {
        userId,
        scenes: next,
      });
    }
  } catch {
    // Storage full or blocked (private mode) — the feature degrades to
    // "doesn't remember," never throws into the navigation callback that
    // calls it.
  }
}

/**
 * Wipe every release's remembered scene. Called from the auth store's
 * SIGNED_OUT handler, alongside resetSceneData() — logging out and back in
 * (even in the same tab, same or different account) must always start every
 * release at Activities, never resume whatever was open in the session that
 * just ended.
 */
export function resetSceneMemory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(MEMORY_CACHE_KEY);
  } catch {
    // Already gone or storage blocked — nothing further to do.
  }
}
