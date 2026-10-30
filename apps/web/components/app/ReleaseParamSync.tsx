'use client';

import { Suspense, useLayoutEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReleaseParamStore } from '@/stores/useReleaseParamStore';

function Sync() {
  const releaseId = useSearchParams().get('release') || null;
  const setReleaseId = useReleaseParamStore((state) => state.setReleaseId);
  // A layout effect, so the chrome re-renders with the right answer before
  // the browser paints.
  useLayoutEffect(() => {
    setReleaseId(releaseId);
  }, [releaseId, setReleaseId]);
  return null;
}

/** Copies ?release= into useReleaseParamStore. Its own Suspense boundary keeps
 *  useSearchParams from bailing the page out of static rendering. */
export function ReleaseParamSync() {
  return (
    <Suspense fallback={null}>
      <Sync />
    </Suspense>
  );
}
