'use client';

import { PageHeaderSkeleton } from './PageHeaderSkeleton';
import { SectionCardSkeleton } from './SectionCardSkeleton';
import { SkeletonBlock } from './SkeletonBlock';

function SongLibraryTableRowSkeleton() {
  return (
    <div className="grid min-h-[74px] grid-cols-[1.3fr_1fr_0.8fr_0.7fr_1fr_0.9fr] items-center gap-3 px-4 py-3">
      <SkeletonBlock className="h-4 w-32 rounded-full" />
      <SkeletonBlock className="h-4 w-24 rounded-full" />
      <SkeletonBlock className="h-4 w-20 rounded-full" />
      <SkeletonBlock className="h-4 w-10 rounded-full" />
      <SkeletonBlock className="h-7 w-28 rounded-full" />
      <SkeletonBlock className="h-4 w-24 rounded-full" />
    </div>
  );
}

export function SongLibrarySkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1240px] px-4 pb-8 pt-20 sm:px-8 sm:py-10 md:py-12">
        <PageHeaderSkeleton
          showBadge={false}
          sidePanel={
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <SkeletonBlock className="h-11 w-full rounded-full sm:w-36" />
              <SkeletonBlock className="h-11 w-full rounded-full sm:w-32" />
            </div>
          }
        />

        <section className="mt-8">
          <SectionCardSkeleton>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,320px)]">
              <div className="rounded-[24px] border border-stroke-subtle bg-bg-elevated/80 p-4">
                <SkeletonBlock className="h-3 w-16 rounded-full" />
                <SkeletonBlock className="mt-3 h-12 w-full rounded-[18px]" />
              </div>
              <div className="rounded-[24px] border border-stroke-subtle bg-bg-elevated/80 p-4">
                <SkeletonBlock className="h-3 w-14 rounded-full" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <SkeletonBlock className="h-9 w-24 rounded-full" />
                  <SkeletonBlock className="h-9 w-28 rounded-full" />
                  <SkeletonBlock className="h-9 w-24 rounded-full" />
                  <SkeletonBlock className="h-9 w-28 rounded-full" />
                </div>
              </div>
            </div>
          </SectionCardSkeleton>
        </section>

        <section className="mt-8 overflow-hidden rounded-[30px] border border-stroke-default bg-bg-surface/95 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stroke-default px-5 py-4 sm:px-6">
            <div>
              <SkeletonBlock className="h-3 w-14 rounded-full" />
              <SkeletonBlock className="mt-4 h-10 w-60 rounded-[16px]" />
            </div>
            <SkeletonBlock className="h-7 w-24 rounded-full" />
          </div>

          <div className="hidden md:block">
            <div className="grid grid-cols-[1.3fr_1fr_0.8fr_0.7fr_1fr_0.9fr] gap-3 border-b border-stroke-default bg-bg-elevated/80 px-4 py-3">
              <SkeletonBlock className="h-3 w-16 rounded-full" />
              <SkeletonBlock className="h-3 w-20 rounded-full" />
              <SkeletonBlock className="h-3 w-10 rounded-full" />
              <SkeletonBlock className="h-3 w-16 rounded-full" />
              <SkeletonBlock className="h-3 w-24 rounded-full" />
              <SkeletonBlock className="h-3 w-20 rounded-full" />
            </div>
            <div className="divide-y divide-stroke-default bg-bg-surface/90">
              {Array.from({ length: 5 }).map((_, index) => (
                <SongLibraryTableRowSkeleton key={`song-row-${index}`} />
              ))}
            </div>
          </div>

          <div className="space-y-3 p-4 md:hidden">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`song-card-${index}`}
                className="rounded-[24px] border border-stroke-subtle bg-bg-elevated/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <SkeletonBlock className="h-4 w-36 rounded-full" />
                    <SkeletonBlock className="h-4 w-24 rounded-full" />
                  </div>
                  <SkeletonBlock className="h-7 w-24 rounded-full" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[18px] border border-stroke-subtle bg-bg-surface px-4 py-3">
                    <SkeletonBlock className="h-3 w-12 rounded-full" />
                    <SkeletonBlock className="mt-2 h-4 w-20 rounded-full" />
                  </div>
                  <div className="rounded-[18px] border border-stroke-subtle bg-bg-surface px-4 py-3">
                    <SkeletonBlock className="h-3 w-20 rounded-full" />
                    <SkeletonBlock className="mt-2 h-4 w-28 rounded-full" />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <SkeletonBlock className="h-8 w-20 rounded-full" />
                  <SkeletonBlock className="h-8 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
