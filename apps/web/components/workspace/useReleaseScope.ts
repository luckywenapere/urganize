'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

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

export type ReleaseScope = {
  scopedReleaseId: string | null;
  setScope: (releaseId: string | null) => void;
};

/**
 * Read/write the `?release=` search param via the App Router.
 * Passing `null` removes the param entirely (no `?release=`).
 * Uses `router.replace` with `scroll: false` so click-to-scope doesn't
 * jump the page to the top.
 */
export function useReleaseScope(): ReleaseScope {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(SCOPE_PARAM);
  const scopedReleaseId = raw && raw.length > 0 ? raw : null;

  const setScope = useCallback(
    (releaseId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (releaseId) {
        params.set(SCOPE_PARAM, releaseId);
      } else {
        params.delete(SCOPE_PARAM);
      }
      const query = params.toString();
      router.replace(`${pathname ?? ''}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return { scopedReleaseId, setScope };
}
