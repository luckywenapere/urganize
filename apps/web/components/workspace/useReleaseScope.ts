'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { clearSceneScopedParams, SCENE_NAMES, type SceneName } from './useSceneOverlay';
import { decideIncomingScene, recallScene, rememberScene } from '@/lib/scene-memory';

/** The `?scene=` param, owned by useSceneOverlay — read here so the outgoing
 * release's current scene can be captured before it's overwritten below (see
 * SCENE_PARAM in that file; kept as a literal for the same reason
 * RELEASE_PARAM is kept as a literal there — two otherwise-independent
 * sibling hooks, not a real import cycle). */
const SCENE_PARAM = 'scene';

const isSceneName = (value: string | null): value is SceneName =>
  Boolean(value) && (SCENE_NAMES as readonly string[]).includes(value as string);

/**
 * URL param that scopes the task list to a single release.
 *
 * INVARIANT: this is the SAME key the existing Tasks page reads —
 * `app/dashboard/tasks/page.tsx` calls `searchParams.get('release')` (line 116)
 * and writes it back via `syncFilter({ release: ... })` (line 353). The
 * workspace scope toggle and the Tasks page's Release filter (until it is
 * removed) read from one piece of state. Do not rename in one place without
 * renaming in the other.
 */
const SCOPE_PARAM = 'release';

export type SetScopeOptions = {
  /**
   * When true, push a new history entry instead of replacing the current one.
   * The mobile drill-down model uses this so the browser back button returns
   * the user to Level 1 (no scope) — without it, `replace` collapses the
   * scope change into the current history entry and back navigates out of
   * the workspace entirely. Desktop callers should leave this unset (default
   * `replace`) so filter-like click cycles don't pollute history.
   */
  push?: boolean;
  /**
   * Leave the outgoing release at Activities instead of remembering whatever
   * scene it was showing.
   *
   * The workspace back arrow passes this, and it is what stops that arrow
   * looping: an explicit "leave this release" must not be resumed into the
   * scene it left, or the user taps the release again and lands straight back
   * in the thing they were trying to get out of. Switching BETWEEN releases
   * (rail cards, UrgAns links, a note's release chip) deliberately does not
   * pass it — resuming each release where it was left is the whole point of
   * lib/scene-memory.
   */
  forgetScene?: boolean;
  /**
   * Show this scene on the release being scoped to, overriding whatever it
   * was last showing. `null` forces the main view.
   *
   * The point is that it is ATOMIC. Before this existed, "go to release B and
   * show scene S" meant setScope(B) followed by openScene(S, B) — two
   * navigations, where the first one resolves the scene from memory and the
   * second corrects it, so the wrong scene paints for a frame and either call
   * can lose the race. Omit the field entirely to keep the resume behaviour;
   * see decideIncomingScene for why absent and null differ.
   */
  scene?: SceneName | null;
};

export type ReleaseScope = {
  scopedReleaseId: string | null;
  setScope: (releaseId: string | null, options?: SetScopeOptions) => void;
};

/**
 * Read/write the `?release=` search param via the App Router.
 * Passing `null` removes the param entirely (no `?release=`).
 * Default: `router.replace` with `scroll: false` so click-to-scope on
 * desktop doesn't jump the page to the top or grow history. Mobile drill-in
 * passes `{ push: true }` so browser back can return to Level 1.
 */
export function useReleaseScope(): ReleaseScope {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(SCOPE_PARAM);
  const scopedReleaseId = raw && raw.length > 0 ? raw : null;

  const setScope = useCallback(
    (releaseId: string | null, options?: SetScopeOptions) => {
      const params = new URLSearchParams(searchParams.toString());
      const previousReleaseId = params.get(SCOPE_PARAM);

      // Changing which release is scoped invalidates any scene-internal params
      // left over from the previous one (the content calendar's tab + month —
      // see SCENE_SCOPED_PARAMS). Without this, release A's calendar id can
      // survive into release B and trip B's "that calendar no longer exists"
      // warning as a false positive. Only clears on an actual change, so
      // re-scoping to the same release still resumes its calendar view.
      if (previousReleaseId !== releaseId) {
        const urlScene = params.get(SCENE_PARAM);

        // Remember what the release we're LEAVING was showing (its `scene`
        // param, or none = Activities) before it's touched below — see
        // lib/scene-memory.ts. This and useSceneOverlay.openScene's matching
        // hook are the two "release is changing" choke points, the same pair
        // SCENE_SCOPED_PARAMS already uses.
        if (previousReleaseId) {
          const outgoingScene = options?.forgetScene ? null : urlScene;
          rememberScene(previousReleaseId, isSceneName(outgoingScene) ? outgoingScene : null);
        }

        clearSceneScopedParams(params);

        // WHICH SCENE THE INCOMING RELEASE SHOWS. The whole rule lives in
        // lib/scene-memory.ts's decideIncomingScene — including the
        // "only when scoping from nothing" condition on the URL scene — so
        // that it can be tested without a DOM. This hook renders nothing and
        // has no unit test of its own, so any decision left inline here is a
        // decision nothing checks. Read that function before changing this.
        const nextScene = releaseId
          ? decideIncomingScene({
              previousReleaseId,
              urlScene,
              ...(options && 'scene' in options ? { requested: options.scene ?? null } : {}),
              remembered: recallScene(releaseId),
            })
          : null;

        if (nextScene) {
          params.set(SCENE_PARAM, nextScene);
        } else {
          params.delete(SCENE_PARAM);
        }
      }

      if (releaseId) {
        params.set(SCOPE_PARAM, releaseId);
      } else {
        params.delete(SCOPE_PARAM);
      }
      const query = params.toString();
      const url = `${pathname ?? ''}${query ? `?${query}` : ''}`;
      if (options?.push) {
        router.push(url, { scroll: false });
      } else {
        router.replace(url, { scroll: false });
      }
    },
    [pathname, router, searchParams]
  );

  return { scopedReleaseId, setScope };
}
