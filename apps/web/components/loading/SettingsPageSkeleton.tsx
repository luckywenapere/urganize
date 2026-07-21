'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Settings loading state, rendered inline by `SettingsPageClient` while
 * auth/profile data are in flight (no `app/settings/loading.tsx` route
 * fallback — same inline-swap rationale as `WorkspaceSkeleton`).
 *
 * Reserves the settings frame (outer chrome + 960px inner column) so
 * content doesn't jump on load: the top `grid-cols-2` row (Profile,
 * Appearance, Security — 3 panels, so the grid wraps exactly like the real
 * page) plus the full-width stacked panels below it (Workspace artist,
 * Workspace logo, Notifications, Teammates, Releases, Session, Delete
 * account).
 * Panel corners/border match `panelClass` (`rounded-3xl`) so the skeleton
 * doesn't visibly "un-round" when real content swaps in. Each slot is a
 * single dim block rather than mocked inputs/labels — same convention as
 * `ReleaseDetailSkeleton`. Shimmer respects `prefers-reduced-motion` via
 * the global rule in `globals.css`.
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

          {/* Profile, Appearance, Security — 3 panels in a 2-col grid, same
              wrap as the real page (row 2 has one panel, not two). */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-56 rounded-3xl border border-stroke-default bg-bg-surface" />
            <div className="h-56 rounded-3xl border border-stroke-default bg-bg-surface" />
            <div className="h-56 rounded-3xl border border-stroke-default bg-bg-surface lg:col-start-1" />
          </div>

          {/* Workspace artist, Workspace logo, Notifications, Teammates,
              Releases, Session, Delete account — stacked full-width, same
              order as the real page. */}
          <div className="mt-6 space-y-6">
            <div className="h-40 rounded-3xl border border-stroke-default bg-bg-surface" />
            <div className="h-56 rounded-3xl border border-stroke-default bg-bg-surface" />
            <div className="h-40 rounded-3xl border border-stroke-default bg-bg-surface" />
            <div className="h-48 rounded-3xl border border-stroke-default bg-bg-surface" />
            <div className="h-40 rounded-3xl border border-stroke-default bg-bg-surface" />
            <div className="h-32 rounded-3xl border border-stroke-default bg-bg-surface" />
            <div className="h-40 rounded-3xl border border-status-error/35 bg-status-error/10" />
          </div>
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
