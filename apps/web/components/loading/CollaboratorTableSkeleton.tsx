'use client';

import { SkeletonBlock } from './SkeletonBlock';

type CollaboratorTableSkeletonProps = {
  rows?: number;
  showHeader?: boolean;
};

type CollaboratorCardSkeletonProps = {
  showViewAction?: boolean;
};

function CollaboratorSectionHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-2">
        <SkeletonBlock className="h-4 w-28 rounded-full" />
        <SkeletonBlock className="h-3 w-40 rounded-full" />
      </div>
      <SkeletonBlock className="h-10 w-32 rounded-full" />
    </div>
  );
}

function CollaboratorColumnHeaderSkeleton() {
  return (
    <div className="grid grid-cols-[1.15fr_0.8fr_1.1fr_0.8fr_1.05fr] gap-3 border-b border-stroke-default bg-bg-elevated/80 px-5 py-3">
      <SkeletonBlock className="h-3 w-20 rounded-full" />
      <SkeletonBlock className="h-3 w-10 rounded-full" />
      <SkeletonBlock className="h-3 w-14 rounded-full" />
      <SkeletonBlock className="h-3 w-12 rounded-full" />
      <SkeletonBlock className="h-3 w-14 rounded-full" />
    </div>
  );
}

export function CollaboratorRowSkeleton({
  showViewAction = false,
}: {
  showViewAction?: boolean;
}) {
  return (
    <div className="grid min-h-[92px] grid-cols-[1.15fr_0.8fr_1.1fr_0.8fr_1.05fr] items-center gap-3 px-5 py-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-4 w-32 rounded-full" />
      </div>

      <SkeletonBlock className="h-4 w-20 rounded-full" />

      <div className="space-y-2">
        <SkeletonBlock className="h-4 w-36 rounded-full" />
      </div>

      <div className="space-y-2">
        <SkeletonBlock className="h-6 w-20 rounded-full" />
        <SkeletonBlock className="h-3 w-24 rounded-full" />
      </div>

      <div className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-9 w-20 rounded-full" />
        <SkeletonBlock className="h-9 w-16 rounded-full" />
        {showViewAction ? <SkeletonBlock className="h-9 w-14 rounded-full" /> : null}
      </div>
    </div>
  );
}

export function CollaboratorCardSkeleton({
  showViewAction = false,
}: CollaboratorCardSkeletonProps) {
  return (
    <div className="rounded-[26px] border border-stroke-subtle bg-bg-elevated/70 p-4 shadow-[0_18px_40px_-28px_rgba(0,0,0,0.3)]">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <SkeletonBlock className="h-4 w-36 rounded-full" />
            <SkeletonBlock className="h-3 w-20 rounded-full" />
          </div>
          <SkeletonBlock className="h-6 w-20 rounded-full" />
        </div>

        <div className="grid gap-3">
          <div className="rounded-[18px] border border-stroke-default bg-bg-surface/90 px-4 py-3">
            <SkeletonBlock className="h-3 w-10 rounded-full" />
            <SkeletonBlock className="mt-2 h-4 w-24 rounded-full" />
          </div>

          <div className="rounded-[18px] border border-stroke-default bg-bg-surface/90 px-4 py-3">
            <SkeletonBlock className="h-3 w-14 rounded-full" />
            <SkeletonBlock className="mt-2 h-4 w-36 rounded-full" />
          </div>
        </div>

        <div className="rounded-[18px] border border-stroke-subtle bg-bg-surface/70 px-4 py-3">
          <SkeletonBlock className="h-3 w-20 rounded-full" />
          <SkeletonBlock className="mt-2 h-4 w-24 rounded-full" />
        </div>
      </div>

      <div className="mt-4 grid gap-2.5">
        <SkeletonBlock className="h-11 w-full rounded-2xl" />
        <SkeletonBlock className="h-11 w-full rounded-2xl" />
        {showViewAction ? <SkeletonBlock className="h-11 w-full rounded-2xl" /> : null}
      </div>
    </div>
  );
}

export function CollaboratorTableSkeleton({
  rows = 4,
  showHeader = true,
}: CollaboratorTableSkeletonProps) {
  const rowFlags = Array.from({ length: rows }).map((_, index) => index === 1);

  return (
    <section className="space-y-4" aria-hidden="true">
      {showHeader ? <CollaboratorSectionHeaderSkeleton /> : null}

      <div className="hidden md:block">
        <div className="overflow-hidden rounded-[24px] border border-stroke-default bg-bg-surface/95">
          <CollaboratorColumnHeaderSkeleton />
          <div className="divide-y divide-stroke-default">
            {rowFlags.map((showViewAction, index) => (
              <CollaboratorRowSkeleton
                key={`collaborator-row-skeleton-${index}`}
                showViewAction={showViewAction}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {rowFlags.slice(0, 3).map((showViewAction, index) => (
          <CollaboratorCardSkeleton
            key={`collaborator-card-skeleton-${index}`}
            showViewAction={showViewAction}
          />
        ))}
      </div>
    </section>
  );
}

export const CollaboratorSectionSkeleton = CollaboratorTableSkeleton;
