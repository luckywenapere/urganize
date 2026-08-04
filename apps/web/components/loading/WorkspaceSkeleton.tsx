'use client';

import { useSearchParams } from 'next/navigation';
import { useChappiStore } from '@/stores/useChappiStore';
import { SkeletonBlock } from './SkeletonBlock';
import { useKnownReleaseCount } from './known-counts';

// Same URL param useReleaseScope reads (`?release=`). Knowing this at
// skeleton-render time (before release data has loaded) lets the skeleton
// reserve the FOCUSED 3-column shape instead of always assuming the at-rest
// grid — the two are visually very different, and landing on a scoped URL
// (a release deep link, a notification click, a refresh) is a common path.
const SCOPE_PARAM = 'release';

// Same build-time flags TasksPanel reads for its scoped-header pills. The
// skeleton renders one placeholder pill per REAL pill so the row doesn't
// change width when content swaps in: New activity is always present;
// Metadata / Calendar / Files / Press kit appear per flag, in that order
// (2026-08-04 — the release detail page and its "Overview" pill were
// removed; Metadata moved to the front of the row).
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';
const EPK_ENABLED = process.env.NEXT_PUBLIC_FEATURE_EPK === 'true';

// Same flag AppTopbar/ChappiDock read. The UrgAns side rail renders itself
// beside AppShell's <main> (URG-210) — including while this skeleton shows —
// so the skeleton no longer reserves a panel slot of its own; it only needs
// the rail's open state to mirror the focused view's hideRails behavior.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// The two AI actions the removed release detail page used to carry (Tailor
// plan / Generate status update) now render as extra pills at the end of
// this same header row (WorkspaceView), so the skeleton reserves their
// width too when their flags are on.
const TAILOR_PLAN_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TAILOR_PLAN === 'true';
const STATUS_UPDATE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_STATUS_UPDATE === 'true';

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
  const isRailOpen = useChappiStore((state) => state.railOpen);
  const isChatOpen = CHAPPI_ENABLED && isRailOpen;
  const knownCount = useKnownReleaseCount();

  return (
    <main className="bg-bg-base text-content-primary" aria-hidden="true">
      <div className="min-w-0 pb-6 pt-6 sm:px-6 sm:pb-24">
          <section className="lg:hidden">
            {isFocused ? (
              <MobileFocusedSkeleton />
            ) : (
              <ReleaseGridSkeleton count={Math.min(knownCount, 6)} columns="sm:grid-cols-2" />
            )}
          </section>

          <section className="hidden lg:block">
            {isFocused ? (
              <DesktopFocusedSkeleton knownCount={knownCount} hideRails={isChatOpen} />
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

/** Tasks header row + one dim block for the list. Pill count mirrors the
 * real scoped header exactly: New activity always, then one per enabled
 * flag in order (Metadata / Calendar / Files / Press kit — see TasksPanel),
 * then the two AI action pills WorkspaceView appends. Widths approximate
 * each label so the row's footprint matches. */
function TasksPanelSkeleton() {
  const pillWidths = [
    'w-28', // New activity
    ...(METADATA_ENABLED ? ['w-28'] : []), // Metadata + Beta tag
    ...(CONTENT_CALENDAR_ENABLED ? ['w-28'] : []), // Calendar + Beta tag
    ...(FILES_ENABLED ? ['w-16'] : []), // Files
    ...(EPK_ENABLED ? ['w-24'] : []), // Press kit
    ...(TAILOR_PLAN_ENABLED ? ['w-28'] : []), // Tailor plan
    ...(STATUS_UPDATE_ENABLED ? ['w-40'] : []), // Generate status update
  ];
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SkeletonBlock className="h-3 w-14" />
        <div className="flex flex-wrap items-center gap-2">
          {pillWidths.map((width, index) => (
            <SkeletonBlock key={`pill-${index}`} className={`h-8 ${width} rounded-full`} />
          ))}
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
function DesktopFocusedSkeleton({
  knownCount,
  hideRails = false,
}: {
  knownCount: number;
  hideRails?: boolean;
}) {
  // Rails mirror WorkspaceDesktopFocused's split of the NON-selected
  // releases: ceiling on the left, floor on the right (count-aware,
  // founder call 2026-07-23). Capped at 3 per rail — beyond that the rail
  // scrolls anyway, so more placeholders add nothing.
  const nonSelected = Math.max(0, knownCount - 1);
  const leftCount = Math.min(3, Math.ceil(nonSelected / 2));
  const rightCount = Math.min(3, Math.floor(nonSelected / 2));
  return (
    <div className="space-y-4">
      {/* Compact back button + motion tracker strip. */}
      <div className="flex items-center gap-4">
        <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
        <SkeletonBlock className="h-2.5 w-14" />
        <SkeletonBlock className="h-1 flex-1 rounded-full" />
        <SkeletonBlock className="h-2.5 w-8" />
      </div>

      <div
        className={`grid items-start gap-6 ${
          hideRails
            ? 'grid-cols-[minmax(0,1fr)]'
            : 'lg:grid-cols-[220px_minmax(0,1fr)_220px] xl:grid-cols-[260px_minmax(0,1fr)_260px]'
        }`}
      >
        {hideRails ? null : (
          <div className="min-w-0 space-y-3">
            {Array.from({ length: leftCount }).map((_, index) => (
              <ReleaseCardSkeleton key={`rail-left-${index}`} />
            ))}
          </div>
        )}

        <div className="min-w-0 space-y-6">
          {/* The focused card lives in the topbar now — the center column
              is the activities panel alone. */}
          <TasksPanelSkeleton />
        </div>

        {hideRails ? null : (
          <div className="min-w-0 space-y-3">
            {Array.from({ length: rightCount }).map((_, index) => (
              <ReleaseCardSkeleton key={`rail-right-${index}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
