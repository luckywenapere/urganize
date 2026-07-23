'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Release-detail loading state, rendered inline by `ReleaseDetailPageClient`
 * while auth/release data are in flight (no
 * `app/dashboard/releases/[releaseId]/loading.tsx` route fallback — same
 * inline-swap rationale as `WorkspaceSkeleton`).
 *
 * Reserves the release-detail frame (max-w-[1000px] column, pt-6): the
 * artist + title moved into the topbar (2026-07-23), so the page — and this
 * skeleton — starts at the meta/actions row (date + status left, action
 * pills right), then the Motion bar and the activities region as dim
 * rounded blocks. Shimmer animation respects `prefers-reduced-motion` via
 * the global rule in `globals.css`.
 *
 * After hydration, the release-detail page returns `null` rather than
 * re-rendering this skeleton — that keeps the loading state to a single
 * calm pass.
 */
export function ReleaseDetailSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary" aria-hidden="true">
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-6 sm:px-6">
        {/* Meta/actions row: date + status pill left, action pills right. */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-5 w-14 rounded-full" />
          </div>
          <SkeletonBlock className="h-9 w-40 rounded-full" />
        </div>

        <div className="mt-6 h-16 rounded-xl border border-stroke-default bg-bg-surface" />

        <div className="mt-6 h-72 rounded-xl border border-stroke-default bg-bg-surface" />

        <div className="mt-6 h-48 rounded-xl border border-stroke-default bg-bg-surface" />
      </div>
    </main>
  );
}
