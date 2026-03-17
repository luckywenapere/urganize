'use client';

import { SectionCardSkeleton } from './SectionCardSkeleton';
import { SkeletonBlock } from './SkeletonBlock';

function MetadataHeaderSkeleton() {
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <SkeletonBlock className="h-4 w-24 rounded-full" />
        <div className="rounded-full border border-stroke-default bg-bg-surface px-4 py-2">
          <SkeletonBlock className="h-4 w-24 rounded-full" />
        </div>
      </div>

      <SectionCardSkeleton className="min-h-[154px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <SkeletonBlock className="h-3 w-32 rounded-full" />
            <SkeletonBlock className="mt-3 h-[clamp(3.1rem,7vw,4.4rem)] w-[min(28rem,82%)] rounded-[22px]" />
            <SkeletonBlock className="mt-4 h-4 w-36 rounded-full" />
          </div>
          <SkeletonBlock className="h-7 w-32 rounded-full" />
        </div>
      </SectionCardSkeleton>
    </>
  );
}

function MetadataSummarySkeleton() {
  const rows = [
    { labelWidth: 'w-12', valueWidth: 'w-36' },
    { labelWidth: 'w-24', valueWidth: 'w-32' },
    { labelWidth: 'w-10', valueWidth: 'w-20' },
    { labelWidth: 'w-10', valueWidth: 'w-20' },
    { labelWidth: 'w-12', valueWidth: 'w-24' },
    { labelWidth: 'w-16', valueWidth: 'w-20' },
  ];

  return (
    <SectionCardSkeleton className="min-h-[248px]">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 p-4">
          <SkeletonBlock className="h-3 w-24 rounded-full" />
          <div className="mt-4 space-y-3">
            {rows.map((row, index) => (
              <div key={`release-summary-${index}`} className="flex items-center gap-3">
                <SkeletonBlock className={`h-4 ${row.labelWidth} rounded-full`} />
                <SkeletonBlock className={`h-4 ${row.valueWidth} rounded-full`} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 p-4">
          <SkeletonBlock className="h-3 w-24 rounded-full" />
          <div className="mt-4 space-y-3">
            {[
              ['w-16', 'w-10'],
              ['w-16', 'w-10'],
              ['w-12', 'w-10'],
              ['w-24', 'w-10'],
              ['w-12', 'w-10'],
              ['w-16', 'w-10'],
            ].map(([labelWidth, valueWidth], index) => (
              <div key={`credit-summary-${index}`} className="flex items-center gap-3">
                <SkeletonBlock className={`h-4 ${labelWidth} rounded-full`} />
                <SkeletonBlock className={`h-4 ${valueWidth} rounded-full`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionCardSkeleton>
  );
}

function MetadataRowSkeleton() {
  return (
    <div className="rounded-[18px] border border-stroke-subtle bg-bg-surface px-4 py-3">
      <SkeletonBlock className="h-4 w-32 rounded-full" />
      <SkeletonBlock className="mt-2 h-4 w-24 rounded-full" />
    </div>
  );
}

function MetadataGroupSkeleton({
  titleWidth,
  rows = 3,
}: {
  titleWidth: string;
  rows?: number;
}) {
  return (
    <div className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 p-4">
      <SkeletonBlock className={`h-3 ${titleWidth} rounded-full`} />
      <div className="mt-3 space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <MetadataRowSkeleton key={`metadata-row-${titleWidth}-${index}`} />
        ))}
      </div>
    </div>
  );
}

export function MetadataPageSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1040px] px-4 pb-10 pt-20 sm:px-6 sm:py-10">
        <div className="space-y-6">
          <MetadataHeaderSkeleton />

          <MetadataSummarySkeleton />

          <div className="grid gap-4 lg:grid-cols-2">
            <MetadataGroupSkeleton titleWidth="w-28" rows={3} />
            <MetadataGroupSkeleton titleWidth="w-24" rows={3} />
            <MetadataGroupSkeleton titleWidth="w-32" rows={2} />
            <MetadataGroupSkeleton titleWidth="w-20" rows={2} />
            <MetadataGroupSkeleton titleWidth="w-24" rows={2} />
          </div>
        </div>
      </div>
    </main>
  );
}
