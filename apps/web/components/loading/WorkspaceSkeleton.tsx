'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { readPersistedState } from '@/lib/persisted-state';
import { SkeletonBlock } from './SkeletonBlock';

// Same URL param useReleaseScope reads (`?release=`). Knowing this at
// skeleton-render time (before release data has loaded) lets the skeleton
// reserve the FOCUSED 3-column shape instead of always assuming the at-rest
// grid — the two are visually very different, and landing on a scoped URL
// (a release deep link, a notification click, a refresh) is a common path.
const SCOPE_PARAM = 'release';

// Last-known roster size, written by useReleaseStore on every successful
// command-center load. Lets the skeleton render THIS user's shape — one
// release gets one centered slot, three get three — instead of a generic
// grid that collapses when real data lands (founder call, 2026-07-23).
const COUNT_KEY = 'urganize.workspace.release-count';
const DEFAULT_COUNT = 4;

function useKnownReleaseCount(): number {
  // SSR/first paint uses the default; the persisted value hydrates in a
  // mount effect (same pattern as TasksPanel's bucket state) to avoid a
  // server/client HTML mismatch.
  const [count, setCount] = useState(DEFAULT_COUNT);
  useEffect(() => {
    const persisted = readPersistedState<number>(
      COUNT_KEY,
      1,
      (value): value is number => typeof value === 'number' && Number.isFinite(value)
    );
    if (persisted !== null && persisted >= 0) {
      setCount(Math.max(1, Math.min(12, Math.round(persisted))));
    }
  }, []);
  return count;
}

/**
 * Workspace loading state, rendered inline by `WorkspaceView` (and the
 * legacy dashboard) while auth/the first command-center fetch are in
 * flight — see the callers for why this isn't a route-segment `loading.tsx`
 * fallback file (none exists for `/dashboard`; the skeleton swap happens
 * inside the client component itself so SSR and hydration share one JSX
 * pass with no remount).
 *
 * Mirrors the CURRENT workspace shape, not a generic placeholder:
 *  - the at-rest release grid: mobile 2-up (`ReleasesColumn`), desktop 3-up
 *    at lg / 4-up at xl (`WorkspaceDesktopGrid`), each card slot shaped like
 *    `WorkspaceReleaseCard`'s tile variant (square art + meta block)
 *  - the FOCUSED shape when `?release=` is present: mobile back-header +
 *    task list (`WorkspaceView`'s mobile branch), desktop 3-column
 *    rail/center/rail (`WorkspaceDesktopFocused`) with the center card in
 *    its `focused` (horizontal thumbnail) variant
 *
 * Large content regions (art squares, the task list area) stay static dim
 * boxes rather than shimmering — same convention as `ReleaseDetailSkeleton`
 * / `SettingsPageSkeleton`, where only short text-line placeholders animate.
 * Shimmer respects `prefers-reduced-motion` via the global rule in
 * `globals.css`.
 */
export function WorkspaceSkeleton() {
  const searchParams = useSearchParams();
  const isFocused = Boolean(searchParams.get(SCOPE_PARAM));
  const knownCount = useKnownReleaseCount();

  return (
    <main className="bg-bg-base text-content-primary" aria-hidden="true">
      <div className="pb-6 pt-6 sm:px-6 sm:pb-24">
        <section className="lg:hidden">
          {isFocused ? (
            <MobileFocusedSkeleton />
          ) : (
            <ReleaseGridSkeleton count={Math.min(knownCount, 6)} columns="sm:grid-cols-2" />
          )}
        </section>

        <section className="hidden lg:block">
          {isFocused ? (
            <DesktopFocusedSkeleton />
          ) : (
            <ReleaseGridSkeleton
              count={knownCount}
              columns="justify-center [grid-template-columns:repeat(auto-fit,minmax(240px,280px))]"
            />
          )}
        </section>
      </div>
    </main>
  );
}

/** At-rest surface: a grid of card slots. No label line — the real grid
 * dropped its "Releases" eyebrow (2026-07-23), and the desktop variant uses
 * the SAME centered auto-fit template as WorkspaceDesktopGrid with 4 slots
 * (the typical roster size) so the resolved cards land where the skeleton
 * stood instead of collapsing from a fuller placeholder grid. */
function ReleaseGridSkeleton({ count, columns }: { count: number; columns: string }) {
  // max-sm: cards center at the golden-section width, matching
  // ReleasesColumn's phone layout (61.8vw cap, not edge to edge).
  return (
    <div className="space-y-3 lg:space-y-4">
      <div className={`grid gap-3 max-sm:justify-items-center lg:gap-4 ${columns}`}>
        {Array.from({ length: count }).map((_, index) => (
          <div key={`release-card-${index}`} className="w-full max-w-[61.8vw] sm:max-w-none">
            <ReleaseCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tile-variant card slot: square art block + eyebrow/title/date/progress. */
function ReleaseCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface">
      <div className="aspect-square border-b border-stroke-subtle bg-bg-elevated" />
      <div className="space-y-2.5 px-4 py-4">
        <SkeletonBlock className="h-2.5 w-20" />
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-2.5 w-24" />
        <SkeletonBlock className="mt-1.5 h-1 w-full" />
      </div>
    </div>
  );
}

/** "Tasks" header row (New task + Files pills) + one dim block for the list. */
function TasksPanelSkeleton() {
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SkeletonBlock className="h-3 w-14" />
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-8 w-24 rounded-full" />
          <SkeletonBlock className="h-8 w-20 rounded-full" />
        </div>
      </div>
      <div className="h-72 rounded-xl border border-stroke-default bg-bg-surface" />
    </div>
  );
}

/**
 * Mobile focused shape (< lg): the drill-down back header (back button,
 * artist eyebrow + title — see `WorkspaceView`'s mobile branch; deleting a
 * release moved to Settings-only, URG-163, so there's no second button here
 * anymore) above the tasks panel. No release rail on mobile; it's a single
 * column, matching the real drill-down.
 */
function MobileFocusedSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <SkeletonBlock className="h-2.5 w-24" />
          <SkeletonBlock className="h-5 w-40" />
        </div>
      </div>
      {/* Motion tracker strip (label + bar + count), mirrors the real one. */}
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-2.5 w-14" />
        <SkeletonBlock className="h-1 flex-1 rounded-full" />
        <SkeletonBlock className="h-2.5 w-8" />
      </div>
      <TasksPanelSkeleton />
    </div>
  );
}

/**
 * Desktop focused shape (≥ lg): mirrors `WorkspaceDesktopFocused` — a back
 * button, then the 3-column grid (rail / centered focused card + tasks
 * panel / rail). Rail widths match the real breakpoints (220px at lg,
 * 260px at xl) so the center column doesn't visibly resize when content
 * replaces the skeleton.
 */
function DesktopFocusedSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-8 w-44" />

      <div className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)_220px] xl:grid-cols-[260px_minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <ReleaseCardSkeleton key={`rail-left-${index}`} />
          ))}
        </div>

        <div className="min-w-0 space-y-6">
          {/* The focused card lives in the topbar now — the center column
              is the activities panel alone. */}
          <TasksPanelSkeleton />
        </div>

        <div className="min-w-0 space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <ReleaseCardSkeleton key={`rail-right-${index}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
