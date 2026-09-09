import { readPersistedState, writePersistedState } from './persisted-state';
import { resolveActiveScene, type SceneName } from './scene-cache';

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
 * WAS Activities).
 *
 * A plain storage read: it answers what was REMEMBERED, not what may be shown.
 * Whether that scene can still render is `decideIncomingScene`'s job, which is
 * the one place validity is applied — see the note on its `remembered` field. */
export function recallScene(releaseId: string): SceneName | null {
  if (!releaseId) return null;
  const userId = readSessionUserId();
  return readScenes(userId)[releaseId] ?? null;
}

/**
 * Which scene the release being scoped TO should show — the precedence rule
 * between three candidate answers, and the whole of the fix for a "Review your
 * draft plan" tap that landed on Metadata (founder report, 2026-09-08).
 *
 * MEMORY IS A DEFAULT, NEVER AN OVERRIDE. That inversion was the bug: setScope
 * used to overwrite whatever `scene` the URL was carrying with whatever it
 * remembered for the incoming release, so an explicitly requested scene lost to
 * a scene the user had merely visited earlier. On a single-release account the
 * auto-scope runs setScope on arrival, so every return to /dashboard resolved
 * to the remembered scene and destroyed the one that had just been asked for.
 *
 * Order, highest first:
 *
 *  1. `requested` — the caller said so outright. `null` is a real answer here
 *     ("no scene"), which is why the field's ABSENCE is what means "no
 *     opinion", tested with `in` rather than a truthiness check. Same
 *     absent-vs-null distinction the metadata and curator PATCH routes make,
 *     and for the same reason: three states, not two.
 *  2. `urlScene` — a scene already in the address bar, and ONLY when
 *     `previousReleaseId` is null. That is the one case where the scene in the
 *     URL was authored for the release being scoped TO: a deep link, a shared
 *     URL, or the single-release auto-scope firing under one. When SWITCHING
 *     between two releases the URL's scene belongs to the release being LEFT,
 *     and carrying it across is the leak this module was built to stop — so
 *     that condition lives in here rather than in the caller, where it could
 *     not be tested.
 *  3. `remembered` — recallScene's answer, flag-filtered HERE. A remembered
 *     scene outlives the flag that allowed it: switch Content off and a
 *     release last showing the calendar would otherwise get `scene=calendar`
 *     written back into its URL, where `resolveActiveScene` nulls it on
 *     render — address bar says one thing, panel shows the main view. Null
 *     means it simply resumes at the main view, which is what renders anyway.
 *
 * Pure on purpose: the storage read and the URL read both happen in the hook,
 * so the rule itself is unit-testable without a DOM.
 */
export type IncomingSceneInput = {
  /** The release being left, or null when scoping from no release at all. */
  previousReleaseId: string | null;
  /** Whatever `scene` the URL is carrying right now. */
  urlScene: string | null;
  /** What the caller asked for. ABSENT means "no opinion"; null means "none". */
  requested?: SceneName | null;
  /** recallScene's answer for the release being scoped to. */
  remembered: SceneName | null;
};

export function decideIncomingScene(input: IncomingSceneInput): SceneName | null {
  if ('requested' in input) return input.requested ?? null;

  // Validated, not merely name-checked, in both places below: a scene whose
  // flag is off cannot render, so honouring one would leave the URL saying one
  // thing and the panel showing another.
  if (input.previousReleaseId === null) {
    const fromUrl = resolveActiveScene(input.urlScene);
    if (fromUrl) return fromUrl;
  }

  return input.remembered ? resolveActiveScene(input.remembered) : null;
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
 * Forget the scene of whichever release the CURRENT url has scoped, so coming
 * back to it lands on Activities.
 *
 * HALF of what a "leave this release" control does; the other half is
 * recording that the catalog was asked for, so a single-release workspace does
 * not auto-scope the navigation away. Both halves live behind ONE step,
 * lib/catalog-intent.ts's leaveReleaseForCatalog — call that, not this, from a
 * new catalog control. Every plain <Link href="/dashboard"> in the chrome now
 * comes through it (the topbar icon, the side menu's Catalog row,
 * MobileNavBar's Home tab, the mobile search's page results); the workspace
 * back arrow reaches the scene half through SetScopeOptions.forgetScene
 * instead, which knows the OUTGOING release without re-reading the url.
 *
 * Reads the url at CALL time on purpose. Every caller is a click handler in
 * layout-level chrome, and scoping a release is a same-pathname `replace` that
 * none of that chrome subscribes to — a render-time copy would go stale on the
 * one transition that matters most.
 */
export function forgetSceneForCurrentRelease(): void {
  if (typeof window === 'undefined') return;
  let releaseId: string | null = null;
  try {
    releaseId = new URLSearchParams(window.location.search).get('release');
  } catch {
    return;
  }
  if (releaseId) rememberScene(releaseId, null);
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
