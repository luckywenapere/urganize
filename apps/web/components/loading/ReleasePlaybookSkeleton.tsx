'use client';

import { SkeletonBlock } from './SkeletonBlock';
import { SectionCardSkeleton } from './SectionCardSkeleton';
import { PageHeaderSkeleton } from './PageHeaderSkeleton';

function PhaseSkeleton() {
  return (
    <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-30px_rgba(0,0,0,0.4)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SkeletonBlock className="h-3 w-14 rounded-full" />
          <SkeletonBlock className="mt-3 h-8 w-36 rounded-[16px]" />
          <SkeletonBlock className="mt-3 h-4 w-56 rounded-full" />
        </div>
        <SkeletonBlock className="h-7 w-24 rounded-full" />
      </div>

      <div className="mt-5 space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`playbook-item-${index}`}
            className="flex min-h-[72px] items-center gap-4 rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4"
          >
            <SkeletonBlock className="h-11 w-11 rounded-full" />
            <div className="flex-1">
              <SkeletonBlock className="h-4 w-40 rounded-full" />
              <SkeletonBlock className="mt-3 h-4 w-24 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReleasePlaybookSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-16 sm:px-6 sm:py-10">
        <div className="mb-4">
          <SkeletonBlock className="h-4 w-24 rounded-full" />
        </div>

        <div className="space-y-6">
          <SectionCardSkeleton className="sm:p-7">
            <PageHeaderSkeleton
              metaCardCount={2}
              sidePanel={
                <div className="w-full shrink-0 rounded-[24px] border border-stroke-subtle bg-bg-elevated/65 p-4 lg:w-[260px]">
                  <SkeletonBlock className="h-3 w-20 rounded-full" />
                  <div className="mt-3 flex flex-col gap-3">
                    <SkeletonBlock className="h-11 w-full rounded-[18px]" />
                    <SkeletonBlock className="h-11 w-full rounded-[18px]" />
                  </div>
                </div>
              }
            />
          </SectionCardSkeleton>

          <SectionCardSkeleton className="sm:p-7">
            <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/75 p-5 shadow-[0_20px_44px_-30px_rgba(0,0,0,0.45)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <SkeletonBlock className="h-3 w-28 rounded-full" />
                  <div className="mt-4 flex items-end gap-3">
                    <SkeletonBlock className="h-14 w-24 rounded-[18px]" />
                    <SkeletonBlock className="h-4 w-24 rounded-full" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SkeletonBlock className="h-7 w-24 rounded-full" />
                  <SkeletonBlock className="h-7 w-24 rounded-full" />
                  <SkeletonBlock className="h-7 w-20 rounded-full" />
                </div>
              </div>
              <SkeletonBlock className="mt-5 h-2.5 w-full rounded-full" />
              <SkeletonBlock className="mt-4 h-4 w-[min(26rem,76%)] rounded-full" />
            </div>
          </SectionCardSkeleton>

          <div className="grid gap-5 xl:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <PhaseSkeleton key={`phase-${index}`} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
