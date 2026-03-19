'use client';

import type { ReactNode } from 'react';
import { SkeletonBlock } from './SkeletonBlock';

type PageHeaderSkeletonProps = {
  sidePanel?: ReactNode;
  metaCardCount?: number;
  showBadge?: boolean;
};

export function PageHeaderSkeleton({
  sidePanel = null,
  metaCardCount = 0,
  showBadge = true,
}: PageHeaderSkeletonProps) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <SkeletonBlock className="h-3 w-36 rounded-full" />
          {showBadge ? <SkeletonBlock className="h-7 w-24 rounded-full" /> : null}
        </div>
        <SkeletonBlock className="mt-3 h-12 w-[min(32rem,86%)] rounded-[18px]" />
        <SkeletonBlock className="mt-4 h-4 w-[min(28rem,72%)] rounded-full" />

        {metaCardCount > 0 ? (
          <div className={`mt-5 grid gap-3 ${metaCardCount > 1 ? 'sm:grid-cols-2' : ''}`}>
            {Array.from({ length: metaCardCount }).map((_, index) => (
              <div
                key={`meta-card-${index}`}
                className="rounded-[22px] border border-stroke-subtle bg-bg-elevated/70 px-4 py-4"
              >
                <SkeletonBlock className="h-3 w-20 rounded-full" />
                <SkeletonBlock className="mt-3 h-5 w-28 rounded-full" />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {sidePanel ? sidePanel : null}
    </div>
  );
}
