'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Release-detail loading state. Mounted by
 * `app/dashboard/releases/[releaseId]/loading.tsx` as the route-segment
 * Suspense fallback.
 *
 * Reserves the release-detail frame (max-w-[1000px] column + header + four
 * stacked regions) so content doesn't jump on load, but holds each region
 * with a single dim block instead of mocking task rows, progress bars, and
 * action buttons. Shimmer animation respects `prefers-reduced-motion` via
 * the global rule in `globals.css`.
 *
 * After hydration, the release-detail page returns `null` rather than
 * re-rendering this skeleton — that keeps the loading state to a single
 * calm pass.
 */
export function ReleaseDetailSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary" aria-hidden="true">
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-8 w-2/3" />
        </div>

        <div className="mt-6 h-16 border border-stroke-default bg-bg-surface" />

        <div className="mt-6 h-72 border border-stroke-default bg-bg-surface" />

        <div className="mt-6 h-48 border border-stroke-default bg-bg-surface" />
      </div>
    </main>
  );
}
