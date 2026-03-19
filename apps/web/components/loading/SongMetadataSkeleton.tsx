'use client';

import { SectionCardSkeleton } from './SectionCardSkeleton';
import { SkeletonBlock } from './SkeletonBlock';

function SongMetadataSectionSkeleton({
  rows = 4,
  columns = 2,
}: {
  rows?: number;
  columns?: 1 | 2;
}) {
  return (
    <section className="rounded-[28px] border border-stroke-default bg-bg-surface/95 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.25)]">
      <div className="flex w-full items-center justify-between gap-4 px-5 py-5 sm:px-6">
        <div>
          <SkeletonBlock className="h-5 w-28 rounded-full" />
          <SkeletonBlock className="mt-2 h-4 w-64 rounded-full" />
        </div>
        <SkeletonBlock className="h-7 w-20 rounded-full" />
      </div>
      <div className="border-t border-stroke-default px-5 py-5 sm:px-6">
        <div className={`grid gap-4 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>
          {Array.from({ length: rows }).map((_, index) => (
            <div key={`song-metadata-field-${index}`} className="block text-sm">
              <SkeletonBlock className="mb-2 h-3 w-24 rounded-full" />
              <SkeletonBlock className="h-12 w-full rounded-2xl" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SongMetadataSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1160px] px-4 pb-8 pt-20 sm:px-8 sm:py-10">
        <div className="flex flex-col gap-4 border-b border-stroke-default pb-5 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <SkeletonBlock className="h-4 w-44 rounded-full" />
            <SkeletonBlock className="mt-4 h-14 w-[min(30rem,92%)] rounded-[18px]" />
            <div className="mt-4 flex flex-wrap gap-3">
              <SkeletonBlock className="h-4 w-36 rounded-full" />
              <SkeletonBlock className="h-4 w-24 rounded-full" />
              <SkeletonBlock className="h-4 w-24 rounded-full" />
            </div>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <SkeletonBlock className="h-11 w-full rounded-full sm:w-36" />
            <SkeletonBlock className="h-11 w-full rounded-full sm:w-36" />
          </div>
        </div>

        <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,360px)]">
          <SectionCardSkeleton className="sm:p-6">
            <SkeletonBlock className="h-3 w-28 rounded-full" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={`overview-field-${index}`} className="block text-sm">
                  <SkeletonBlock className="mb-2 h-3 w-24 rounded-full" />
                  <SkeletonBlock className="h-12 w-full rounded-2xl" />
                </div>
              ))}
            </div>
          </SectionCardSkeleton>

          <aside className="rounded-[28px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.25)] sm:p-6">
            <SkeletonBlock className="h-3 w-24 rounded-full" />
            <div className="mt-4 space-y-3">
              <SkeletonBlock className="h-4 w-36 rounded-full" />
              <SkeletonBlock className="h-4 w-40 rounded-full" />
              <SkeletonBlock className="h-4 w-32 rounded-full" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <SkeletonBlock className="h-8 w-24 rounded-full" />
              <SkeletonBlock className="h-8 w-28 rounded-full" />
            </div>
            <SkeletonBlock className="mt-5 h-12 w-full rounded-full" />
          </aside>
        </section>

        <div className="mt-8 space-y-5">
          <SongMetadataSectionSkeleton rows={5} columns={1} />
          <SongMetadataSectionSkeleton rows={6} columns={2} />
          <SongMetadataSectionSkeleton rows={5} columns={2} />
          <SongMetadataSectionSkeleton rows={5} columns={2} />
          <SongMetadataSectionSkeleton rows={2} columns={1} />
        </div>
      </div>
    </main>
  );
}
