'use client';

import { SkeletonBlock } from './SkeletonBlock';

export function CenteredMessageSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto flex min-h-screen max-w-[840px] flex-col items-center justify-center px-6 py-12 text-center">
        <SkeletonBlock className="h-3 w-28 rounded-full" />
        <SkeletonBlock className="mt-4 h-14 w-[min(32rem,88%)] rounded-[20px]" />
        <SkeletonBlock className="mt-4 h-4 w-[min(36rem,94%)] rounded-full" />
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <SkeletonBlock className="h-12 w-40 rounded-2xl" />
          <SkeletonBlock className="h-12 w-40 rounded-2xl" />
        </div>
      </div>
    </main>
  );
}
