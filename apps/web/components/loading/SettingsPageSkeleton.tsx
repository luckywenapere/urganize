'use client';

import { SkeletonBlock } from './SkeletonBlock';

// Same one-liner the real page reads at module scope (SettingsPageClient.tsx)
// — a build-time env constant, synchronously knowable, never wrong.
const WORKSPACE_FEATURE_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

type SettingsPageSkeletonProps = {
  /** Best-effort role hints derived from whatever `user` the auth store has
   * on hand right now — usually already correct. Zustand's `persist`
   * middleware rehydrates `user` from localStorage before `checkAuth()`'s
   * network round trip resolves (isLoading boots true and is NOT persisted —
   * see auth-store.ts), so for a returning user these are the real values,
   * not a guess. Both default false for a genuinely first-ever session
   * (nothing persisted yet) — a strictly safer failure mode than assuming
   * manager+flag-on, since it only OMITS a block rather than showing one
   * that then has to disappear. */
  isManagerAccount?: boolean;
  isArtistAccount?: boolean;
};

/**
 * Settings loading state, rendered inline by `SettingsPageClient` while
 * auth/profile data are in flight (no `app/settings/loading.tsx` route
 * fallback — same inline-swap rationale as `WorkspaceSkeleton`).
 *
 * Reserves the settings frame (outer chrome + 760px inner column) so
 * content doesn't jump on load: one flat column of hairline-divided section
 * slots matching the redesigned page, each gated to the real page's own
 * conditionals (Workspace artist / Workspace logo on the workspace flag,
 * Artist profile on `isArtistAccount`, Teammates on `isManagerAccount`;
 * the rest unconditional). Each slot is a dim kicker line + one dim block
 * rather than mocked inputs/labels — same convention as
 * `ReleaseDetailSkeleton`. Shimmer respects `prefers-reduced-motion` via
 * the global rule in `globals.css`.
 *
 * After hydration, `SettingsPage` returns `null` rather than re-rendering
 * this skeleton — that keeps the loading state to a single calm pass.
 */
export function SettingsPageSkeleton({
  isManagerAccount = false,
  isArtistAccount = false,
}: SettingsPageSkeletonProps) {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary" aria-hidden="true">
      <div className="relative pb-24 pt-6 sm:px-6">
        <div className="relative mx-auto w-full max-w-[760px]">
          {/* Mirrors the page's header row: no in-page "Settings" heading
              (the topbar titles the route), just the Dashboard shortcut. */}
          <div className="mb-4 flex sm:justify-end">
            <SkeletonBlock className="h-10 w-full sm:w-28" />
          </div>

          {/* Flat single-column sections divided by hairlines — mirrors the
              redesigned page (2026-07-23): each slot is a dim kicker line +
              content block, no card boxes. Gating matches the real page's
              conditionals; order (artist first — we serve the artist):
              Workspace artist -> Artist profile -> Profile -> Appearance ->
              Teammates -> Releases -> Security -> Session -> Delete. */}
          <div className="divide-y divide-stroke-subtle">
            {[
              { key: 'workspace-artist', height: 'h-28', show: WORKSPACE_FEATURE_ENABLED },
              { key: 'artist-profile', height: 'h-28', show: isArtistAccount },
              { key: 'profile', height: 'h-40', show: true },
              // Appearance + Notifications share one two-column row on the
              // real page — special-cased in the render below.
              { key: 'appearance-notifications', height: 'h-24', show: true },
              { key: 'teammates', height: 'h-32', show: isManagerAccount },
              { key: 'releases', height: 'h-32', show: true },
              { key: 'security', height: 'h-40', show: true },
              { key: 'session', height: 'h-20', show: true },
              { key: 'delete', height: 'h-28', show: true },
            ]
              .filter((section) => section.show)
              .map((section) =>
                section.key === 'appearance-notifications' ? (
                  <div key={section.key} className="grid gap-x-10 py-9 sm:grid-cols-2">
                    <div>
                      <SkeletonBlock className="mb-5 h-3 w-28" />
                      <SkeletonBlock className={`${section.height} w-full`} />
                    </div>
                    <div className="hidden sm:block">
                      <SkeletonBlock className="mb-5 h-3 w-28" />
                      <SkeletonBlock className={`${section.height} w-full`} />
                    </div>
                  </div>
                ) : (
                  <div key={section.key} className="py-9">
                    <SkeletonBlock className="mb-5 h-3 w-28" />
                    <SkeletonBlock className={`${section.height} w-full`} />
                  </div>
                )
              )}
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
