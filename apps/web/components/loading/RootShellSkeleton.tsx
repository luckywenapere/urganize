'use client';

import { SectionCardSkeleton } from './SectionCardSkeleton';
import { SkeletonBlock } from './SkeletonBlock';

export function RootShellSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="app-layout lazy-fade lazy-fade-in">
        <div className="mx-auto w-full max-w-[980px] px-4 pb-16 pt-24 sm:px-6 sm:pt-28">
          <div className="space-y-6">
            <div className="rounded-[32px] border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_18px_48px_-28px_rgba(0,0,0,0.35)] backdrop-blur-sm sm:p-8">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-full border border-stroke-default bg-bg-elevated/85">
                  <SkeletonBlock className="h-5 w-5 rounded-full" />
                </div>
                <SkeletonBlock className="h-5 w-32 rounded-full" />
              </div>

              <SkeletonBlock className="mt-6 h-14 w-[min(30rem,88%)] rounded-[20px]" />
              <SkeletonBlock className="mt-4 h-4 w-[min(34rem,96%)] rounded-full" />
              <SkeletonBlock className="mt-3 h-4 w-[min(28rem,82%)] rounded-full" />

              <div className="mt-6 flex flex-wrap gap-3">
                <SkeletonBlock className="h-11 w-32 rounded-full" />
                <SkeletonBlock className="h-11 w-28 rounded-full" />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <SectionCardSkeleton>
                <SkeletonBlock className="h-3 w-20 rounded-full" />
                <SkeletonBlock className="mt-4 h-10 w-44 rounded-[16px]" />
                <div className="mt-5 space-y-3">
                  <SkeletonBlock className="h-4 w-full rounded-full" />
                  <SkeletonBlock className="h-4 w-[94%] rounded-full" />
                  <SkeletonBlock className="h-4 w-[88%] rounded-full" />
                </div>
              </SectionCardSkeleton>

              <SectionCardSkeleton>
                <SkeletonBlock className="h-3 w-24 rounded-full" />
                <div className="mt-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div
                      key={`root-shell-card-${index}`}
                      className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 p-4"
                    >
                      <SkeletonBlock className="h-4 w-32 rounded-full" />
                      <SkeletonBlock className="mt-3 h-4 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              </SectionCardSkeleton>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
