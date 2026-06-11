'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Settings loading state. Mounted by `app/settings/loading.tsx` as the
 * route-segment Suspense fallback.
 *
 * Reserves the settings frame (outer chrome + 960px inner column + 2-column
 * panel grid) so content doesn't jump on load, but holds each panel slot
 * with a single dim block instead of mocking inputs, labels, and buttons.
 * Shimmer animation respects `prefers-reduced-motion` via the global rule
 * in `globals.css`.
 *
 * After hydration, `SettingsPage` returns `null` rather than re-rendering
 * this skeleton — that keeps the loading state to a single calm pass.
 */
export function SettingsPageSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary" aria-hidden="true">
      <div className="relative pb-24 pt-6 sm:px-6">
        <div className="relative mx-auto w-full max-w-[960px]">
          {/* Mirrors the page's header row: no in-page "Settings" heading
              (the topbar titles the route), just the Dashboard shortcut pill. */}
          <div className="mb-8 flex sm:justify-end">
            <SkeletonBlock className="h-10 w-full rounded-full sm:w-28" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-64 border border-stroke-default bg-bg-surface" />
            <div className="h-64 border border-stroke-default bg-bg-surface" />
            <div className="h-48 border border-stroke-default bg-bg-surface" />
            <div className="h-48 border border-stroke-default bg-bg-surface" />
          </div>

          <div className="mt-6 h-64 border border-stroke-default bg-bg-surface" />
        </div>
      </div>
    </main>
  );
}

/**
 * Used inline by `app/settings/page.tsx` while the teammates list is
 * fetching — this one stays because it's a sub-region loader, not a
 * duplicate of the route-segment fallback.
 */
export function SettingsTeamMembersSectionSkeleton() {
  return (
    <div className="mt-4 space-y-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={`team-member-skeleton-${index}`}
          className="h-12 border border-stroke-subtle bg-bg-elevated"
        />
      ))}
    </div>
  );
}
