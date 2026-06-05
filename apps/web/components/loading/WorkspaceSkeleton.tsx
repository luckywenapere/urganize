'use client';

/**
 * Workspace loading state. Mounted by `app/dashboard/loading.tsx` as the
 * route-segment Suspense fallback.
 *
 * Reserves the workspace frame (same grid breakpoints as `WorkspaceDesktopGrid`
 * + `ReleasesColumn` at rest) so content doesn't jump on load, but holds each
 * card slot with a single dim block instead of mocking covers, progress bars,
 * and text rows. Shimmer animation respects `prefers-reduced-motion` via the
 * global rule in `globals.css`.
 *
 * After hydration, `WorkspaceView` returns `null` rather than re-rendering
 * this skeleton — see WorkspaceView.tsx for the rationale. That keeps the
 * loading state to a single calm pass instead of a double-flash.
 */
export function WorkspaceSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary" aria-hidden="true">
      <div className="pb-24 pt-6 sm:px-6">
        <section className="space-y-3 lg:hidden">
          <div className="skeleton-shimmer h-3 w-20" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`workspace-skeleton-mobile-${index}`}
                className="aspect-[3/4] border border-stroke-default bg-bg-surface"
              />
            ))}
          </div>
        </section>

        <section className="hidden space-y-4 lg:block">
          <div className="skeleton-shimmer h-3 w-20" />
          <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`workspace-skeleton-desktop-${index}`}
                className="aspect-[3/4] border border-stroke-default bg-bg-surface"
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
