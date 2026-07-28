'use client';

import { SkeletonBlock } from './SkeletonBlock';

/**
 * Chappi page loading state, rendered inline by `ChappiPageClient` while
 * auth/the command-center fetch are in flight (same inline-swap rationale
 * as `WorkspaceSkeleton` — no route-segment `loading.tsx` file).
 *
 * Mirrors the CURRENT Chappi home: the PostHog-style vertically centered
 * empty state (eyebrow → greeting → subline → input bar → quick-action
 * chips) inside the SAME definite-height wrapper ChappiPageClient uses, so
 * the resolved page lands exactly where the skeleton stood. The
 * conversation store is ephemeral (a reload always starts empty), so the
 * empty state is effectively the only shape a fresh load resolves to.
 *
 * Deliberately NOT reserved: the invite-teammates banner — it's
 * manager-gated and dismissal-persisted, so the skeleton can't know whether
 * it will render; a banner popping in beats one vanishing.
 */
export function ChappiPageSkeleton() {
  return (
    <div className="chappi-shell-height" aria-hidden="true">
      <div className="flex h-full min-h-0 flex-col items-center justify-center px-2">
        {/* Eyebrow row: "CHAPPI" + the Beta badge pill. */}
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="h-4 w-9" />
        </div>
        <SkeletonBlock className="mt-3 h-8 w-64 sm:w-80" />
        {/* Subline now wraps to two lines at most widths (longer copy). */}
        <div className="mt-2 flex flex-col items-center gap-2">
          <SkeletonBlock className="h-3.5 w-72 sm:w-[30rem]" />
          <SkeletonBlock className="h-3.5 w-48 sm:w-64" />
        </div>

        {/* Input bar — same width cap as the real form (max-w-2xl). */}
        <div className="mt-6 h-11 w-full max-w-2xl border border-stroke-default bg-bg-surface" />

        {/* Quick-action chips row. */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={`chappi-chip-${index}`} className="h-7 w-24" />
          ))}
        </div>
      </div>
    </div>
  );
}
