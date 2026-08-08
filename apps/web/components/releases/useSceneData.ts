'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSceneDataStore, type ScenePayloadMap } from '@/stores/useSceneDataStore';
import type { SceneName } from '@/lib/scene-cache';

/**
 * Read one release scene's data through the cache.
 *
 * Replaces the "useState + fetch in a mount effect" each scene section used to
 * carry. The behavioral difference that matters: when a cached payload exists
 * (from a previous open, or from the idle prefetch that runs once a release is
 * scoped), `data` is populated on the FIRST render and `isLoading` is false —
 * the scene paints instantly and any refetch happens silently behind it.
 *
 * `isLoading` means "nothing to show yet", NOT "a request is in flight" —
 * that's `isRefreshing`. Sections should gate their skeleton on isLoading only,
 * or a warm open would still flash one.
 */
export function useSceneData<S extends SceneName>(
  releaseId: string,
  scene: S,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled !== false;
  const loadScene = useSceneDataStore((state) => state.loadScene);
  const getScene = useSceneDataStore((state) => state.getScene);
  // Subscribing to the entry (not to a derived value) keeps write-throughs
  // from mutations propagating to every mounted reader of the same scene.
  const entry = useSceneDataStore(
    (state) => state.entries[`${releaseId}:${scene}`]
  );

  // Seeded synchronously so a persisted payload is on screen at first paint,
  // with no skeleton frame in between.
  const [seed] = useState<ScenePayloadMap[S] | null>(() =>
    enabled && releaseId ? getScene(releaseId, scene) : null
  );
  const [error, setError] = useState('');

  const data = (entry?.data as ScenePayloadMap[S] | undefined) ?? seed;

  const reload = useCallback(
    async (opts?: { force?: boolean }) => {
      if (!enabled || !releaseId) return;
      setError('');
      try {
        await loadScene(releaseId, scene, { force: opts?.force ?? true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load this section.');
      }
    },
    [enabled, loadScene, releaseId, scene]
  );

  useEffect(() => {
    if (!enabled || !releaseId) return;
    let active = true;
    setError('');
    loadScene(releaseId, scene).catch((err: unknown) => {
      if (!active) return;
      setError(err instanceof Error ? err.message : 'Could not load this section.');
    });
    return () => {
      active = false;
    };
  }, [enabled, loadScene, releaseId, scene]);

  return {
    data: data ?? null,
    /** True only when there is genuinely nothing to render yet. */
    isLoading: !data && !error,
    isRefreshing: entry?.isRefreshing === true,
    error,
    reload,
  };
}
