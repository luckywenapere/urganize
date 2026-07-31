'use client';

import { SkeletonBlock } from './SkeletonBlock';

// Same build-time flags the real page reads (ReleaseDetailPageClient), in the
// same order it renders them, so the placeholder pill count matches the real
// pill count per environment instead of guessing. The TasksPanelSkeleton
// precedent (URG-199).
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';
const TAILOR_PLAN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TAILOR_PLAN === 'true';
const STATUS_UPDATE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_STATUS_UPDATE === 'true';

/**
 * Release-detail loading state, rendered inline by `ReleaseDetailPageClient`
 * while auth/release data are in flight (no
 * `app/dashboard/releases/[releaseId]/loading.tsx` route fallback — same
 * inline-swap rationale as `WorkspaceSkeleton`).
 *
 * Reserves the release-detail frame (max-w-[1000px] column, pt-6): the
 * artist + title moved into the topbar (2026-07-23), so the page — and this
 * skeleton — starts at the back link, then the meta/actions row (date +
 * status left, scene/action pills right), then the Motion bar and the
 * activities region as dim rounded blocks. Shimmer animation respects
 * `prefers-reduced-motion` via the global rule in `globals.css`.
 *
 * The back link and the flag-gated pill row both landed with URG-200 (side
 * menu removed); this skeleton is kept in lockstep so nothing shifts when
 * real content swaps in.
 *
 * After hydration, the release-detail page returns `null` rather than
 * re-rendering this skeleton — that keeps the loading state to a single
 * calm pass.
 */
export function ReleaseDetailSkeleton() {
  // Widths approximate each pill's rendered label, in the real page's order.
  const pillWidths = [
    ...(CONTENT_CALENDAR_ENABLED ? ['w-44'] : []), // Content calendar + Beta tag
    ...(EPK_ENABLED ? ['w-28'] : []), // Press kit
    ...(TAILOR_PLAN_ENABLED ? ['w-32'] : []), // Tailor plan
    ...(STATUS_UPDATE_ENABLED ? ['w-52'] : []), // Generate status update
  ];

  return (
    <main className="bg-bg-base text-content-primary" aria-hidden="true">
      <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-6 sm:px-6">
        {/* Back link (mb-4 on the real page), same height as the
            FilesPageSkeleton's, which reserves the identical link. */}
        <SkeletonBlock className="mb-4 h-3 w-32" />

        {/* Meta/actions row: date + status pill left, scene/action pills
            right. The right cluster wraps below the left on narrow screens
            exactly as the real row does (flex-col → sm:flex-row). */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-5 w-14 rounded-full" />
          </div>
          {pillWidths.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {pillWidths.map((width, index) => (
                <SkeletonBlock key={`pill-${index}`} className={`h-9 ${width} rounded-full`} />
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-6 h-16 rounded-xl border border-stroke-default bg-bg-surface" />

        <div className="mt-6 h-72 rounded-xl border border-stroke-default bg-bg-surface" />

        <div className="mt-6 h-48 rounded-xl border border-stroke-default bg-bg-surface" />
      </div>
    </main>
  );
}
