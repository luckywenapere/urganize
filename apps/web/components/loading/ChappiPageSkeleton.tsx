'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Chappi page loading state, rendered inline by `ChappiPageClient` while
 * auth/the command-center fetch are in flight (same inline-swap rationale
 * as `WorkspaceSkeleton` — no route-segment `loading.tsx` file).
 *
 * Reserves the header (eyebrow + greeting) and the input bar; the middle
 * region (empty-state cards or transcript) is a single dim block since its
 * eventual shape depends on whether a conversation already exists.
 */
export function ChappiPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" aria-hidden="true">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stroke-subtle pb-4">
        <div>
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="mt-2 h-6 w-48" />
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1 border border-stroke-default bg-bg-surface" />

      <div className="mt-4 h-11 shrink-0 border border-stroke-default bg-bg-surface" />
    </div>
  );
}
