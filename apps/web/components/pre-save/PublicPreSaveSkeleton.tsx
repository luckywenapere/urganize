'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

export function PublicPreSaveSkeleton() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-content-primary">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,rgba(62,207,142,0.16),transparent_58%)]" />
      <div className="absolute inset-y-0 right-[-12rem] w-[26rem] rounded-full bg-[radial-gradient(circle,rgba(62,207,142,0.14),transparent_68%)] blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-8 w-32 rounded-full" />
          <SkeletonBlock className="h-4 w-28 rounded-full" />
        </div>

        <div className="mt-8 grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] lg:items-center">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_40px_100px_-54px_rgba(0,0,0,0.88)]">
            <SkeletonBlock className="aspect-square w-full rounded-[28px]" />
          </div>

          <div className="rounded-[34px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_32px_90px_-50px_rgba(0,0,0,0.82)] backdrop-blur-xl sm:p-8">
            <SkeletonBlock className="h-3 w-24 rounded-full" />
            <SkeletonBlock className="mt-5 h-14 w-full rounded-[22px]" />
            <SkeletonBlock className="mt-4 h-6 w-48 rounded-full" />

            <div className="mt-6 grid grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`countdown-skeleton-${index}`}
                  className="rounded-[22px] border border-white/10 bg-black/30 px-3 py-4"
                >
                  <SkeletonBlock className="mx-auto h-7 w-8 rounded-full" />
                  <SkeletonBlock className="mx-auto mt-3 h-3 w-12 rounded-full" />
                </div>
              ))}
            </div>

            <div className="mt-7 rounded-[30px] border border-white/10 bg-black/30 p-5">
              <SkeletonBlock className="h-4 w-40 rounded-full" />
              <SkeletonBlock className="mt-4 h-14 w-full rounded-full" />
              <SkeletonBlock className="mt-3 h-14 w-full rounded-full" />
              <SkeletonBlock className="mt-4 h-4 w-48 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
