'use client';

import { SkeletonBlock } from './SkeletonBlock';

function ReleaseListCardSkeleton() {
  return (
    <div className="rounded-3xl border border-stroke-subtle bg-bg-elevated p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBlock className="h-5 w-40 rounded-full" />
            <SkeletonBlock className="h-7 w-20 rounded-full" />
          </div>
          <SkeletonBlock className="mt-3 h-4 w-32 rounded-full" />
          <SkeletonBlock className="mt-2 h-4 w-36 rounded-full" />
        </div>
        <div className="sm:min-w-[130px]">
          <SkeletonBlock className="h-3 w-20 rounded-full sm:ml-auto" />
          <SkeletonBlock className="mt-3 h-8 w-16 rounded-[14px] sm:ml-auto" />
        </div>
      </div>
      <SkeletonBlock className="mt-4 h-2 w-full rounded-full" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <SkeletonBlock className="h-3 w-28 rounded-full" />
        <SkeletonBlock className="h-3 w-36 rounded-full" />
      </div>
    </div>
  );
}

export function DashboardPageSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-4 sm:px-8 sm:pb-8 sm:pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SkeletonBlock className="h-12 w-full rounded-full sm:w-[240px]" />
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBlock className="h-12 w-24 rounded-full" />
            <SkeletonBlock className="h-12 w-36 rounded-full" />
          </div>
        </div>

        <section className="mt-4 rounded-[28px] border border-stroke-default bg-bg-surface/95 p-4 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] sm:p-6">
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <ReleaseListCardSkeleton key={`release-${index}`} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
