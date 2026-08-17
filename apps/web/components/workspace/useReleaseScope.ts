'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { clearSceneScopedParams, SCENE_NAMES, type SceneName } from './useSceneOverlay';
import { recallScene, rememberScene } from '@/lib/scene-memory';

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
        // Remember what the release we're LEAVING was showing (its `scene`
        // param, or none = Activities) before it's touched below — see
        // lib/scene-memory.ts. This and useSceneOverlay.openScene's matching
        // hook are the two "release is changing" choke points, the same pair
        // SCENE_SCOPED_PARAMS already uses.
        if (previousReleaseId) {
          const outgoingScene = params.get(SCENE_PARAM);
          rememberScene(previousReleaseId, isSceneName(outgoingScene) ? outgoingScene : null);
        }

        clearSceneScopedParams(params);

        // Resume whatever the release we're ENTERING last showed this
        // session. A release never visited this session (or a fresh login,
        // which wipes all of it — see resetSceneMemory) starts at
        // Activities, matching a plain release-card click's existing
        // default.
        const resumedScene = releaseId ? recallScene(releaseId) : null;
        if (resumedScene) {
          params.set(SCENE_PARAM, resumedScene);
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
