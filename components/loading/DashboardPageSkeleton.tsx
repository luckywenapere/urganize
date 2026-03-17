'use client';

import { SkeletonBlock } from './SkeletonBlock';

function StatCardSkeleton() {
  return (
    <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
      <SkeletonBlock className="h-3 w-24 rounded-full" />
      <SkeletonBlock className="mt-4 h-10 w-20 rounded-[16px]" />
      <SkeletonBlock className="mt-3 h-4 w-40 rounded-full" />
    </div>
  );
}

function ReleaseListCardSkeleton() {
  return (
    <div className="rounded-3xl border border-stroke-subtle bg-bg-elevated px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
      <div className="mx-auto max-w-[1120px] px-4 pb-8 pt-20 sm:px-10 sm:py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <SkeletonBlock className="h-3 w-20 rounded-full" />
            <SkeletonBlock className="mt-4 h-14 w-[min(28rem,84%)] rounded-[20px]" />
            <SkeletonBlock className="mt-4 h-4 w-[min(30rem,92%)] rounded-full" />
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <SkeletonBlock className="h-11 w-full rounded-full sm:w-32" />
            <SkeletonBlock className="h-11 w-full rounded-full sm:w-24" />
            <SkeletonBlock className="h-11 w-full rounded-full sm:w-24" />
          </div>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <SkeletonBlock className="h-3 w-28 rounded-full" />
            <SkeletonBlock className="mt-4 h-10 w-44 rounded-[16px]" />
            <SkeletonBlock className="mt-4 h-4 w-full rounded-full" />
            <SkeletonBlock className="mt-2 h-4 w-[90%] rounded-full" />
            <SkeletonBlock className="mt-6 h-12 w-full rounded-[18px]" />
            <div className="mt-6 space-y-3 rounded-[24px] border border-stroke-subtle bg-bg-elevated/70 p-4">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={`step-${index}`}>
                  <SkeletonBlock className="h-4 w-32 rounded-full" />
                  <SkeletonBlock className="mt-2 h-4 w-full rounded-full" />
                </div>
              ))}
            </div>
          </div>

          <section className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SkeletonBlock className="h-3 w-16 rounded-full" />
                <SkeletonBlock className="mt-4 h-10 w-56 rounded-[16px]" />
              </div>
              <SkeletonBlock className="h-7 w-24 rounded-full" />
            </div>
            <div className="mt-6 space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <ReleaseListCardSkeleton key={`release-${index}`} />
              ))}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
