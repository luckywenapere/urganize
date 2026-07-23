'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Files page loading state, rendered inline by `FilesPageClient` while
 * auth/release data are in flight — same inline-swap rationale as
 * `ReleaseDetailSkeleton` (no `loading.tsx` route fallback). Reserves the
 * back-link + header + single asset-list frame; AssetSection owns its own
 * internal loading state once mounted, so this only covers the page shell.
 */
export function FilesPageSkeleton() {
  return (
    <main className="bg-bg-base text-content-primary" aria-hidden="true">
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
        <SkeletonBlock className="h-3 w-24" />
        <div className="mt-4 space-y-2">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-8 w-2/3" />
        </div>

        <div className="mt-6 h-72 border border-stroke-default bg-bg-surface" />
      </div>
    </main>
  );
}
