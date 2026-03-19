'use client';

import { Logo } from '@/components/ui/Logo';
import { SkeletonBlock } from './SkeletonBlock';

function PublicCreditHeaderSkeleton() {
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border border-stroke-default bg-bg-elevated px-3 py-1.5">
        <div className="h-3 w-28 rounded-full bg-bg-overlay/85 skeleton-shimmer" />
      </div>

      <div>
        <SkeletonBlock className="h-[clamp(3.05rem,8vw,4.2rem)] w-[min(18rem,82%)] rounded-[20px]" />
        <div className="mt-4 space-y-2">
          <SkeletonBlock className="h-4 w-[min(16rem,78%)] rounded-full" />
          <SkeletonBlock className="h-4 w-[min(14rem,64%)] rounded-full" />
        </div>
        <SkeletonBlock className="mt-3 h-4 w-32 rounded-full" />
      </div>
    </div>
  );
}

function ReleaseContextSkeleton() {
  return (
    <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/75 p-5 shadow-[0_18px_44px_-32px_rgba(0,0,0,0.28)]">
      <SkeletonBlock className="h-3 w-16 rounded-full" />
      <div className="mt-4 space-y-3">
        <SkeletonBlock className="h-8 w-[min(16rem,88%)] rounded-[16px]" />
        <SkeletonBlock className="h-8 w-[min(12rem,64%)] rounded-[16px]" />
      </div>
      <div className="mt-4 inline-flex rounded-full border border-stroke-default bg-bg-surface px-3 py-1.5">
        <SkeletonBlock className="h-4 w-32 rounded-full" />
      </div>
    </div>
  );
}

function FormFieldSkeleton({
  labelWidth,
  showOptionalPill = false,
}: {
  labelWidth: string;
  showOptionalPill?: boolean;
}) {
  return (
    <div className="block text-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <SkeletonBlock className={`h-4 ${labelWidth} rounded-full`} />
        {showOptionalPill ? <SkeletonBlock className="h-3 w-14 rounded-full" /> : null}
      </div>
      <div className="min-h-12 w-full rounded-[20px] border border-stroke-subtle bg-bg-surface px-4 py-3">
        <div className="flex h-full items-center">
          <SkeletonBlock className="h-4 w-[72%] rounded-full" />
        </div>
      </div>
    </div>
  );
}

function SubmitButtonSkeleton() {
  return <SkeletonBlock className="min-h-12 w-full rounded-[22px]" />;
}

export function PublicCreditFormSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[720px] px-4 pb-10 pt-8 sm:px-6 sm:py-10">
        <div className="mb-5 flex justify-center sm:justify-start">
          <Logo size="lg" priority />
        </div>

        <div className="rounded-[34px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_22px_56px_-30px_rgba(0,0,0,0.42)] sm:p-8">
          <div className="min-h-[760px] space-y-5 sm:min-h-[780px] sm:space-y-6">
            <PublicCreditHeaderSkeleton />

            <ReleaseContextSkeleton />

            <div className="space-y-6">
              <div className="rounded-[28px] border border-stroke-subtle bg-bg-elevated/70 p-4 sm:p-5">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <SkeletonBlock className="h-4 w-24 rounded-full" />
                    <SkeletonBlock className="mt-3 h-4 w-44 rounded-full" />
                  </div>
                  <div className="rounded-full border border-stroke-default bg-bg-surface px-3 py-1">
                    <SkeletonBlock className="h-3 w-16 rounded-full" />
                  </div>
                </div>

                <div className="space-y-4">
                  <FormFieldSkeleton labelWidth="w-24" />
                  <FormFieldSkeleton labelWidth="w-36" showOptionalPill />
                  <FormFieldSkeleton labelWidth="w-12" />
                </div>
              </div>

              <SubmitButtonSkeleton />

              <div className="rounded-[26px] border border-dashed border-stroke-default bg-bg-elevated/55 p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <SkeletonBlock className="h-4 w-40 rounded-full" />
                    <SkeletonBlock className="mt-3 h-4 w-48 rounded-full" />
                  </div>
                  <div className="grid h-7 w-7 place-items-center rounded-full border border-stroke-subtle bg-bg-surface/80">
                    <div className="h-3 w-3 rounded-full bg-bg-overlay/85 skeleton-shimmer" />
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <FormFieldSkeleton labelWidth="w-16" />
                  <FormFieldSkeleton labelWidth="w-20" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
