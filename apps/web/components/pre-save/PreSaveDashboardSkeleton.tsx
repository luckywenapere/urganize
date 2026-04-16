'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

function CampaignCardSkeleton() {
  return (
    <div className="rounded-[28px] border border-stroke-subtle bg-bg-elevated/80 p-4 sm:p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <SkeletonBlock className="h-20 w-20 rounded-[22px]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <SkeletonBlock className="h-6 w-44 rounded-full" />
              <SkeletonBlock className="h-7 w-24 rounded-full" />
            </div>
            <SkeletonBlock className="mt-3 h-4 w-28 rounded-full" />
            <div className="mt-4 flex flex-wrap gap-2">
              <SkeletonBlock className="h-7 w-24 rounded-full" />
              <SkeletonBlock className="h-7 w-28 rounded-full" />
              <SkeletonBlock className="h-7 w-32 rounded-full" />
            </div>
            <SkeletonBlock className="mt-4 h-12 w-full max-w-[26rem] rounded-[18px]" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <SkeletonBlock className="h-11 w-24 rounded-full" />
          <SkeletonBlock className="h-11 w-28 rounded-full" />
          <SkeletonBlock className="h-11 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function PreSaveDashboardSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-4 sm:px-8 sm:pt-6">
        <div className="rounded-[32px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_22px_56px_-32px_rgba(0,0,0,0.46)] sm:p-8">
          <SkeletonBlock className="h-3 w-28 rounded-full" />
          <SkeletonBlock className="mt-4 h-14 w-full max-w-[34rem] rounded-[22px]" />
          <SkeletonBlock className="mt-4 h-4 w-full max-w-[38rem] rounded-full" />
          <div className="mt-6 flex flex-wrap gap-2">
            <SkeletonBlock className="h-11 w-28 rounded-full" />
            <SkeletonBlock className="h-11 w-32 rounded-full" />
            <SkeletonBlock className="h-11 w-40 rounded-full" />
          </div>
        </div>

        <section className="mt-5 rounded-[32px] border border-stroke-default bg-bg-surface/95 p-4 shadow-[0_22px_56px_-32px_rgba(0,0,0,0.46)] sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <SkeletonBlock className="h-5 w-44 rounded-full" />
              <SkeletonBlock className="mt-3 h-4 w-60 rounded-full" />
            </div>
            <SkeletonBlock className="h-12 w-40 rounded-full" />
          </div>

          <div className="mt-5 space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <CampaignCardSkeleton key={`pre-save-campaign-${index}`} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
