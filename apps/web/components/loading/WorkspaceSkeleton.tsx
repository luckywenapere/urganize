'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Single source of truth for the workspace loading state. Mounted by:
 *
 *   - `app/dashboard/loading.tsx` — Next route-segment Suspense fallback,
 *     rendered on the server while the workspace bundle hydrates.
 *   - `components/workspace/WorkspaceView.tsx` — in-component fallback
 *     while `useReleaseStore.loadCommandCenter()` resolves.
 *
 * Both sites render this same component so the route→client handoff is a
 * zero-shape change. The at-rest (no-scope) shape is shown unconditionally
 * — the route-level loading.tsx cannot read URL params, and the in-component
 * branch fires before scope-routing has resolved the release data anyway.
 * Direct-link users hitting `/dashboard?release=X` see the at-rest grid
 * skeleton briefly before the workspace reflows into the focused layout
 * (acceptable edge case — the centered focus shape is the post-load state).
 *
 * The shape mirrors `WorkspaceView` at rest:
 *   - Outer container: `pb-24 pt-6 sm:px-6` (width inherited from AppShell's
 *     mx-auto max-w-[1440px] — the single page-width source of truth)
 *   - Mobile (< lg): single column of release cards (sm:grid-cols-2)
 *   - Desktop (≥ lg): 3-up at lg, 4-up at xl — the centered-focus at-rest
 *     grid filling the main area, no separate tasks pane
 *
 * Sharp corners throughout (no `rounded-*` utilities on the shimmer blocks)
 * because the live workspace surfaces are sharp-cornered too.
 */

function ReleaseCardSkeleton() {
  return (
    <div className="border border-stroke-default bg-bg-surface">
      {/* Square cover block — same `aspect-square` as the live card */}
      <div className="border-b border-stroke-subtle bg-bg-elevated">
        <SkeletonBlock className="aspect-square w-full" />
      </div>
      <div className="px-4 py-4">
        {/* Artist eyebrow */}
        <SkeletonBlock className="h-3 w-24" />
        {/* Title (two-line clamp in the live card; one block here) */}
        <SkeletonBlock className="mt-2 h-5 w-3/4" />
        {/* Release date */}
        <SkeletonBlock className="mt-2 h-3 w-20" />
        <div className="mt-3">
          {/* Progress label row */}
          <SkeletonBlock className="mb-1.5 h-3 w-16" />
          {/* Progress bar — 4px track in the live card */}
          <SkeletonBlock className="h-1 w-full" />
        </div>
      </div>
    </div>
  );
}

export function WorkspaceSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="pb-24 pt-6 sm:px-6">
        {/* Mobile drill-down L1: single releases list, gutter from AppShell. */}
        <section className="space-y-3 lg:hidden" aria-hidden="true">
          <SkeletonBlock className="h-3 w-20" />
          <SkeletonBlock className="h-11 w-full sm:hidden" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <ReleaseCardSkeleton key={`workspace-skeleton-mobile-card-${index}`} />
            ))}
          </div>
        </section>

        {/* Desktop at-rest centered-focus grid: 3-up at lg, 4-up at xl —
            same shape `WorkspaceDesktopGrid` renders post-load. */}
        <section className="hidden space-y-4 lg:block" aria-hidden="true">
          <SkeletonBlock className="h-3 w-20" />
          <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <ReleaseCardSkeleton key={`workspace-skeleton-desktop-card-${index}`} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
