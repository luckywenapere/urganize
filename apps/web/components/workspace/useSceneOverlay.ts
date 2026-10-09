'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { rememberScene } from '@/lib/scene-memory';

/**
 * URL param naming which release "scene" is open as an overlay window over the
 * workspace (2026-08-04). Before this, Metadata / Calendar / Files / Press kit
 * were each a full route under /dashboard/releases/[releaseId]/* — which meant
 * the topbar lost its release context (AppTopbar's ContextTitle only renders
 * release identity on /dashboard with ?release=), and every open paid a route
 * transition plus a PAGE-level skeleton on top of each section's own internal
 * one. Founder call: open them in place, like the activity pop-up does.
 *
 * DELIBERATE DIVERGENCE FROM THE ACTIVITY POP-UP: the task pop-up
 * (TaskUIProvider) holds its open state in React and never touches the URL.
 * These scenes DO sync to the URL, because the content calendar's `calendar`
 * and `month` params are documented as deep-linkable "by humans and Chappi
 * alike, per the spec" — losing that would be a regression. Founder confirmed
 * the URL should carry the open scene so refresh / Back / sharing all work.
 *
 * NO REACT CONTEXT ON PURPOSE (unlike TaskUIProvider): every bit of "is it
 * open, which one" state lives in the URL, so `activeScene` is DERIVED from
 * searchParams on every render rather than mirrored into a boolean. There is
 * structurally no second copy to desync — browser Back/Forward, a typed URL,
 * a hard refresh, and a legacy-route redirect landing all resolve through the
 * exact same read. Modeled on `useReleaseScope` in this same directory.
 */
const SCENE_PARAM = 'scene';

/** The `?release=` param, owned by useReleaseScope — read here so a scene URL
 * can be made self-sufficient (see openScene). Kept as a literal rather than
 * imported to avoid a circular-feeling dependency between two sibling hooks
 * that are otherwise independent; if this ever drifts, useReleaseScope wins. */
const RELEASE_PARAM = 'release';

// Canonical in lib/scene-cache.ts — the URL layer here and the data layer
// (stores/useSceneDataStore.ts) both key off the same names, so they share one
// definition rather than two lists that can drift. (There were four when this
// was written and there are ten now, which is the drift the shared list
// prevents; the comment itself said "four" until 2026-09-08.)
export { SCENE_NAMES, type SceneName } from '@/lib/scene-cache';
import { SCENE_NAMES, type SceneName } from '@/lib/scene-cache';

/**
 * Params owned by a scene's own internal state rather than by the overlay
 * machinery. Today that's the content calendar's active tab and month.
 *
 * They are deliberately NOT cleared when a window closes: founder call —
 * closing the calendar and reopening it for the SAME release should resume the
 * same tab and month. The accepted cost is a slightly longer URL while shut.
 *
 * But "same release" is load-bearing. Carrying release A's calendar id into
 * release B makes B's calendar fire its existing "that calendar no longer
 * exists" warning as a false positive (nothing was deleted — it's just
 * cross-release residue). So these must be dropped whenever the scoped release
 * actually changes, which is why `clearSceneScopedParams` is exported and also
 * called from `useReleaseScope`: a release can change either by opening a scene
 * for a different release, or by picking a different release in the workspace,
 * and both paths have to clear.
 */
export const SCENE_SCOPED_PARAMS: readonly string[] = ['calendar', 'month', 'field'];

/**
 * The input a scene should land on when it opens (2026-10-09): the distribution
 * check's Fix buttons send the person to "Metadata, the Genre box", not just to
 * Metadata. It is the one scene param that is NOT remembered across a close: a
 * field is an instruction for one arrival, so closeScene drops it and an open
 * that names no field clears any left over. It is also dropped when the scoped
 * release changes, like the calendar's params (it is in SCENE_SCOPED_PARAMS for
 * that reason).
 */
export const FIELD_PARAM = 'field';

/** Strip every scene-internal param. Mutates the passed URLSearchParams. */
export function clearSceneScopedParams(params: URLSearchParams): void {
  for (const key of SCENE_SCOPED_PARAMS) {
    params.delete(key);
  }
}

export type SceneOverlay = {
  /** Null unless the URL names a known scene. NOT flag-filtered — both
   * consumers immediately re-gate this through `resolveActiveScene`, which is
   * what decides whether the scene can actually render. */
  activeScene: SceneName | null;
  /** `options.field` names the input to land on (see FIELD_PARAM); omit it and
   * any field left in the URL is cleared. */
  openScene: (scene: SceneName, releaseId: string, options?: { field?: string | null }) => void;
  closeScene: () => void;
};

const isSceneName = (value: string | null): value is SceneName =>
  Boolean(value) && (SCENE_NAMES as readonly string[]).includes(value as string);

export function useSceneOverlay(): SceneOverlay {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(SCENE_PARAM);
  const activeScene = isSceneName(raw) ? raw : null;

  const openScene = useCallback(
    (scene: SceneName, releaseId: string, options?: { field?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      const previousReleaseId = params.get(RELEASE_PARAM);

      // Opening a scene for a DIFFERENT release than the URL currently scopes
      // must drop the previous release's scene-internal params — see
      // SCENE_SCOPED_PARAMS. Clears ALL of them, not just the incoming scene's,
      // so residue can't survive an intermediate hop (open Metadata for B while
      // A's calendar params linger, then open B's calendar).
      if (previousReleaseId !== releaseId) {
        // A release change too — remember what the OUTGOING release was
        // showing before its scene is overwritten below (see
        // lib/scene-memory.ts and the matching hook in
        // useReleaseScope.setScope, the two "release is changing" choke
        // points). No restore-lookup needed for the incoming release here:
        // `scene` (the argument) is about to overwrite whatever it last had
        // regardless.
        if (previousReleaseId) {
          const outgoingScene = params.get(SCENE_PARAM);
          rememberScene(previousReleaseId, isSceneName(outgoingScene) ? outgoingScene : null);
        }
        clearSceneScopedParams(params);
      }

      // Idempotent for every entry point that exists today (the pills only
      // render once a release is scoped), but it makes a scene URL complete
      // on its own — so a future caller can deep-link straight into a scene
      // without the workspace having scoped there first.
      params.set(RELEASE_PARAM, releaseId);

      const wasOpen = isSceneName(searchParams.get(SCENE_PARAM));
      params.set(SCENE_PARAM, scene);
      // A field belongs to ONE arrival: set when this open names one, cleared
      // otherwise so it cannot linger into a later, unrelated open.
      if (options?.field) params.set(FIELD_PARAM, options.field);
      else params.delete(FIELD_PARAM);

      const url = `${pathname ?? ''}?${params.toString()}`;

      // History model (founder call): opening from closed PUSHES, so the
      // browser back button closes the window — which is exactly what the
      // <Link> pills did before this change, so muscle memory is preserved.
      // Switching straight from one open scene to another REPLACES, so Back
      // never makes the user undo scene-switches one at a time.
      if (wasOpen) {
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
      }
    },
    [pathname, router, searchParams]
  );

  const closeScene = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(SCENE_PARAM);
    params.delete(FIELD_PARAM);
    const query = params.toString();

    // REPLACE, never router.back(). A legacy-route redirect can make a
    // scene-open URL the FIRST history entry in a tab; router.back() would
    // then eject the user out of the app entirely on close. replace always
    // leaves them on the workspace, however they arrived.
    router.replace(`${pathname ?? ''}${query ? `?${query}` : ''}`, { scroll: false });
  }, [pathname, router, searchParams]);

  return { activeScene, openScene, closeScene };
}
