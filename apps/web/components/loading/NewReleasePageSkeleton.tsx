'use client';

import { SectionCardSkeleton } from './SectionCardSkeleton';
import { SkeletonBlock } from './SkeletonBlock';

export function NewReleasePageSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[880px] px-4 pb-10 pt-16 sm:px-6 sm:py-10">
        <div className="mb-4">
          <SkeletonBlock className="h-4 w-32 rounded-full" />
        </div>

        <SectionCardSkeleton className="sm:p-7">
          <SkeletonBlock className="h-3 w-20 rounded-full" />
          <SkeletonBlock className="mt-3 h-12 w-[min(24rem,82%)] rounded-[20px]" />
          <SkeletonBlock className="mt-4 h-4 w-[min(30rem,90%)] rounded-full" />

          <div className="mt-8 space-y-5">
            <div>
              <SkeletonBlock className="h-4 w-24 rounded-full" />
              <SkeletonBlock className="mt-2 h-12 w-full rounded-2xl" />
            </div>
            <div>
              <SkeletonBlock className="h-4 w-20 rounded-full" />
              <SkeletonBlock className="mt-2 h-12 w-full rounded-2xl" />
            </div>
            <div>
              <SkeletonBlock className="h-4 w-32 rounded-full" />
              <SkeletonBlock className="mt-2 h-32 w-full rounded-[22px]" />
            </div>

            <SkeletonBlock className="h-12 w-full rounded-2xl" />
          </div>
        </SectionCardSkeleton>
      </div>
    </main>
  );
}
