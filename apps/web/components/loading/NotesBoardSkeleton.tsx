'use client';

import { SectionCardSkeleton } from './SectionCardSkeleton';
import { SkeletonBlock } from './SkeletonBlock';

function NoteCardSkeleton() {
  return (
    <article className="mb-5 break-inside-avoid rounded-[28px] border border-stroke-default bg-bg-surface p-5 shadow-[0_20px_40px_-30px_rgba(0,0,0,0.35)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <SkeletonBlock className="h-5 w-32 rounded-full" />
          <SkeletonBlock className="mt-2 h-3 w-28 rounded-full" />
        </div>
        <SkeletonBlock className="h-8 w-14 rounded-full" />
      </div>

      <div className="mt-4 space-y-3">
        <SkeletonBlock className="h-4 w-full rounded-full" />
        <SkeletonBlock className="h-4 w-[92%] rounded-full" />
        <SkeletonBlock className="h-4 w-[88%] rounded-full" />
        <SkeletonBlock className="h-4 w-[84%] rounded-full" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={`note-dot-${index}`} className="h-7 w-7 rounded-full" />
          ))}
        </div>
        <SkeletonBlock className="h-8 w-16 rounded-full" />
      </div>
    </article>
  );
}

export function NotesBoardSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1220px] px-4 pb-8 pt-20 sm:px-8 sm:py-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <SkeletonBlock className="h-3 w-16 rounded-full" />
            <SkeletonBlock className="mt-4 h-14 w-[min(34rem,92%)] rounded-[18px]" />
            <SkeletonBlock className="mt-4 h-4 w-[min(36rem,96%)] rounded-full" />
          </div>
          <div className="w-full max-w-sm rounded-[26px] border border-stroke-default bg-bg-surface/95 p-3 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.45)] sm:w-auto">
            <SkeletonBlock className="h-12 w-full rounded-[18px]" />
          </div>
        </div>

        <section className="mt-8">
          <SectionCardSkeleton className="rounded-[30px]">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_220px]">
              <div className="space-y-3">
                <SkeletonBlock className="h-12 w-full rounded-[20px]" />
                <SkeletonBlock className="h-[148px] w-full rounded-[22px]" />
              </div>
              <div className="flex flex-col gap-4 rounded-[24px] border border-stroke-subtle bg-bg-elevated/80 p-4 lg:justify-between">
                <div>
                  <SkeletonBlock className="h-3 w-16 rounded-full" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <SkeletonBlock key={`composer-tone-${index}`} className="h-9 w-9 rounded-full" />
                    ))}
                  </div>
                </div>
                <SkeletonBlock className="h-12 w-full rounded-[18px]" />
              </div>
            </div>
          </SectionCardSkeleton>
        </section>

        <section className="mt-8 columns-1 gap-5 sm:columns-2 xl:columns-3">
          <NoteCardSkeleton />
          <NoteCardSkeleton />
          <NoteCardSkeleton />
          <NoteCardSkeleton />
        </section>
      </div>
    </main>
  );
}
