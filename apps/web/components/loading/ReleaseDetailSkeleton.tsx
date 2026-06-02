'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Single source of truth for the release-detail loading state. Mounted by:
 *
 *   - `app/dashboard/releases/[releaseId]/loading.tsx` — route-segment
 *     Suspense fallback, server-rendered during navigation.
 *   - `app/dashboard/releases/[releaseId]/page.tsx` — in-component fallback
 *     while `useReleaseStore` hydrates the release detail.
 *
 * Mirrors the live release detail page (`releases/[releaseId]/page.tsx`):
 *   - Outer wrap: `mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6`
 *   - Header: artist eyebrow + title + date/status row, with two right-side
 *     action button placeholders (the AI Tailor/Status buttons that render
 *     when their flags are on — kept here so the skeleton doesn't shrink
 *     when those flags are enabled)
 *   - Progress band: bordered box with "Task progress" label + count + bar
 *   - Tasks section: eyebrow + 5 task-row blocks
 *   - Files section: eyebrow + upload control placeholder + a couple of
 *     category group placeholders
 *
 * Sharp corners throughout to match the live release-detail surfaces.
 */
export function ReleaseDetailSkeleton() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
      {/* Header row — artist eyebrow + title + date/status + action buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="mt-2 h-8 w-3/4" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-5 w-20" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SkeletonBlock className="h-9 w-32" />
          <SkeletonBlock className="h-9 w-40" />
        </div>
      </div>

      {/* Task progress band */}
      <div className="mt-6 border border-stroke-default bg-bg-surface p-4">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-4 w-24" />
        </div>
        <SkeletonBlock className="mt-2 h-2 w-full" />
      </div>

      {/* Tasks section */}
      <section className="mt-6">
        <SkeletonBlock className="h-3 w-12" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`release-detail-task-${index}`}
              className="flex items-center gap-3 border border-stroke-default bg-bg-surface px-4 py-3"
            >
              <SkeletonBlock className="h-5 w-5" />
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="ml-auto h-3 w-16" />
            </div>
          ))}
        </div>
      </section>

      {/* Files section */}
      <section className="mt-8">
        <SkeletonBlock className="h-3 w-12" />
        <SkeletonBlock className="mt-2 h-4 w-64" />
        <SkeletonBlock className="mt-4 h-11 w-full" />
        <div className="mt-6 space-y-3">
          <SkeletonBlock className="h-3 w-20" />
          <div className="grid gap-3 sm:grid-cols-2">
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-20 w-full" />
          </div>
        </div>
      </section>
    </div>
  );
}
