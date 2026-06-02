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
 * zero-shape change. The L1 (no-scope) shape is shown unconditionally —
 * the route-level loading.tsx cannot read URL params, and the in-component
 * branch fires before scope-routing has resolved the release data anyway.
 * Direct-link mobile users hitting `/dashboard?release=X` see the L1
 * skeleton briefly before the page reflows to L2 (acceptable edge case).
 *
 * The shape mirrors `WorkspaceView`:
 *   - Outer container: `mx-auto max-w-[1440px] px-4 pb-24 pt-6 sm:px-6`
 *   - Grid: `lg:grid-cols-[3fr_2fr]` (3fr releases / 2fr tasks)
 *   - Releases column: `sm:grid-cols-2 lg:grid-cols-3` of aspect-square
 *     cover + text body + progress, matching `WorkspaceReleaseCard`
 *   - Tasks column: eyebrow + 2 filter selects + 5 collapsed bucket headers,
 *     matching `TasksPanel` (desktop-only at this level via `hidden lg:block`
 *     — on mobile L1 the right column is hidden by `WorkspaceView`'s own
 *     visibility rules)
 *
 * Sharp corners throughout (no `rounded-*` utilities on the shimmer blocks)
 * because the live workspace surfaces are sharp-cornered too. The filter
 * select blocks keep `rounded-lg` to match the live `<select>` styling.
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

function TasksPanelSkeleton() {
  return (
    <aside className="space-y-3" aria-hidden="true">
      {/* "TASKS" eyebrow */}
      <SkeletonBlock className="h-3 w-12" />
      {/* Priority + Status filter selects */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SkeletonBlock className="h-10 w-full rounded-lg" />
        <SkeletonBlock className="h-10 w-full rounded-lg" />
      </div>
      {/* Five collapsed bucket headers (Overdue / Today / Week / Upcoming / No due date) */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={`workspace-skeleton-bucket-${index}`}
            className="border border-stroke-default bg-bg-surface"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-4 w-4" />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function FilesPanelSkeleton() {
  return (
    <section
      className="mt-8 border border-stroke-default bg-bg-surface px-4 py-4"
      aria-hidden="true"
    >
      <SkeletonBlock className="h-3 w-12" />
      <SkeletonBlock className="mt-2 h-4 w-48" />
    </section>
  );
}

export function WorkspaceSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1440px] px-4 pb-24 pt-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          {/* Releases column — visible on mobile L1 and desktop. Matches
              ReleasesColumn: eyebrow + (mobile-only "New release" button)
              + responsive grid of release cards. */}
          <section className="space-y-3" aria-hidden="true">
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-11 w-full sm:hidden" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <ReleaseCardSkeleton key={`workspace-skeleton-card-${index}`} />
              ))}
            </div>
          </section>

          {/* Tasks + Files column — desktop-only at L1. `hidden lg:block`
              matches the live `WorkspaceView` visibility rule for the
              no-scope state on mobile. */}
          <div className="hidden lg:block">
            <TasksPanelSkeleton />
            <FilesPanelSkeleton />
          </div>
        </div>
      </div>
    </main>
  );
}
