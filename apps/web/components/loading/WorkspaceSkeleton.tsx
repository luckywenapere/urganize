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
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
// Notes' scoped-release link (TasksPanel, after Pitch) — added 2026-08-10;
// this reservation was missing even though the real pill has rendered
// behind the flag since Notes shipped, an existing skeleton/real mismatch
// found while fixing the mobile pill-row overflow bug.
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

// Same flag AppTopbar/ChappiDock read. The UrgAns side rail renders itself
// beside AppShell's <main> (URG-210) — including while this skeleton shows —
// so the skeleton no longer reserves a panel slot of its own; it only needs
// the rail's open state to mirror the focused view's hideRails behavior.
const CHAPPI_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CHAPPI === 'true';

// Mirrors WorkspaceDesktopFocused's own IDENTITY_PANEL_ENABLED const — the
// focused rails there wait for xl (and drop the 260px xl bump) once the
// identity card is on, so this skeleton's grid must reserve that same shape.
const IDENTITY_PANEL_ENABLED =
  process.env.NEXT_PUBLIC_FEATURE_IDENTITY_PANEL === 'true' &&
  process.env.NEXT_PUBLIC_FEATURE_WORKSPACE === 'true';

// The AI action the removed release detail page used to carry (Generate status
// update) now renders as an extra pill at the end of this same header row
// (WorkspaceView), so the skeleton reserves its width too when the flag is on.
const STATUS_UPDATE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_STATUS_UPDATE === 'true';

// The release recap pill (WorkspaceView) is deliberately NOT reserved here,
// unlike the two AI pills above. It only appears once a release is finished,
// which depends on release and task data this skeleton renders BEFORE it has.
// Reserving it unconditionally would shrink the row for every unfinished
// release, so the jump is taken on the rarer finished case instead.

/**
 * Workspace loading state, rendered inline by `WorkspaceView` (and the
 * legacy dashboard) while auth/the first command-center fetch are in
 * flight — see the callers for why this isn't a route-segment `loading.tsx`
 * fallback file (none exists for `/dashboard`; the skeleton swap happens
 * inside the client component itself so SSR and hydration share one JSX
 * pass with no remount).
 *
 * Mirrors the CURRENT workspace shape, not a generic placeholder (re-synced
 * 2026-08-06, URG-228, against the state after URG-224/225/226):
 *  - the at-rest release grid: mobile 2-up (`ReleasesColumn`, plus its
 *    `sm:hidden` full-width "New release" button), desktop centered auto-fit
 *    up to 4-up capped at 1008px (`WorkspaceDesktopGrid`) — each card slot
 *    shaped like `WorkspaceReleaseCard`'s tile variant (square art + meta
 *    block, including the Motion label row above the progress bar)
 *  - the FOCUSED shape when `?release=` is present: mobile back-header +
 *    task list (`WorkspaceView`'s mobile branch), desktop the
 *    viewport-locked 3-column rail/center/rail frame (`WorkspaceDesktopFocused`)
 *    — the page never scrolls there, so this skeleton reserves the same
 *    `h-[calc(100dvh-9.25rem-1px)]` height instead of a shorter unbounded stack
 *  - the tasks panel's header row (sticky on mobile, right-aligned pills, no
 *    left label) and its bucket-list body (`TasksPanel`)
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
  // Mirrors WorkspaceView's hideRailsForLayout exactly: rails also hide while
  // the calendar scene is open, and a refresh on a `?scene=calendar` URL used
  // to paint 3-column rails here that vanished the moment data resolved.
  const isCalendarScene =
    CONTENT_CALENDAR_ENABLED && searchParams.get('scene') === 'calendar';
  const hideRails = (CHAPPI_ENABLED && isRailOpen) || isCalendarScene;
  const knownCount = useKnownReleaseCount();

  return (
    <main className="bg-bg-base text-content-primary" aria-hidden="true">
      {/* lg:pt-0 (URG-224 + URG-226), lg:px-0 (URG-231) and the focused-only
          lg:pb-0 all mirror WorkspaceView's own wrapper exactly — see that
          file's comments for why only ITS pt-6/px-6 (not <main>'s shared
          pt-5/px-8) drop at lg+. This class string must stay byte-identical
          to WorkspaceView's or the skeleton shifts when data resolves. */}
      <div
        className={`min-w-0 pt-6 sm:px-6 lg:px-0 lg:pt-0 ${isFocused ? 'pb-6 sm:pb-24 lg:pb-0' : 'pb-6 sm:pb-24'}`}
      >
          <section className="lg:hidden">
            {isFocused ? (
              <MobileFocusedSkeleton />
            ) : (
              <ReleaseRowListSkeleton count={Math.min(knownCount, 6)} />
            )}
          </section>

          <section className="hidden lg:block">
            {isFocused ? (
              <DesktopFocusedSkeleton knownCount={knownCount} hideRails={hideRails} />
            ) : (
              // Matches WorkspaceDesktopGrid's current template exactly
              // (240px max track + the 1008px structural cap — see that
              // file's comment for the width-budget arithmetic; URG-225).
              <ReleaseGridSkeleton
                count={knownCount}
                columns="mx-auto max-w-[1008px] justify-center [grid-template-columns:repeat(auto-fit,minmax(220px,240px))]"
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
  return (
    <div className="space-y-3 lg:space-y-4">
      <div className={`grid gap-3 lg:gap-4 ${columns}`}>
        {Array.from({ length: count }).map((_, index) => (
          <ReleaseCardSkeleton key={`release-card-${index}`} />
        ))}
      </div>
    </div>
  );
}

/** At-rest MOBILE surface (2026-08-07): the full-width "New release" button
 * ReleasesColumn shows below sm, then a stack of horizontal row slots. Mirrors
 * that file's `space-y-3` list of `focused`-variant cards — fixed square
 * thumbnail (w-28, sm:w-36) beside the meta column — so nothing resizes when
 * the real cards resolve. */
function ReleaseRowListSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-3">
      <SkeletonBlock className="h-11 w-full rounded-full sm:hidden" />
      {Array.from({ length: count }).map((_, index) => (
        <ReleaseRowSkeleton key={`release-row-${index}`} />
      ))}
    </div>
  );
}

/** Focused-variant row slot: the art block is `aspect-square` on a fixed
 * width, which is what sets the row's height — same as the real card, where
 * the meta column is `self-stretch` beside it. */
function ReleaseRowSkeleton() {
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-stroke-default bg-bg-surface">
      <div className="aspect-square w-28 shrink-0 border-r border-stroke-subtle bg-bg-elevated sm:w-36" />
      <div className="min-w-0 flex-1 space-y-2.5 px-4 py-4">
        <SkeletonBlock className="h-2.5 w-20" />
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-2.5 w-24" />
        <div className="mt-1.5 flex items-center justify-between">
          <SkeletonBlock className="h-2.5 w-12" />
          <SkeletonBlock className="h-2.5 w-20" />
        </div>
        <SkeletonBlock className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}

/** Tile-variant card slot: square art block + eyebrow/title/date/Motion row
 * (label + "X of Y done" + progress bar — WorkspaceReleaseCard's exact meta
 * shape, so the resolved card doesn't grow a line the skeleton didn't have). */
function ReleaseCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface">
      <div className="aspect-square border-b border-stroke-subtle bg-bg-elevated" />
      <div className="space-y-2.5 px-4 py-4">
        <SkeletonBlock className="h-2.5 w-20" />
        <SkeletonBlock className="h-4 w-3/4" />
        <SkeletonBlock className="h-2.5 w-24" />
        <div className="mt-1.5 flex items-center justify-between">
          <SkeletonBlock className="h-2.5 w-12" />
          <SkeletonBlock className="h-2.5 w-20" />
        </div>
        <SkeletonBlock className="h-1.5 w-full rounded-full" />
      </div>
    </div>
  );
}

/** Tasks header row + collapsed bucket-row placeholders. Structurally mirrors
 * TasksPanel's real `<aside>` (flex column, sticky-on-mobile header, a
 * flex-1 scrolling body) so it can stretch to fill the locked focused
 * column on desktop, or sit inert in mobile's plain document flow — same
 * "flex-1 is inert without a flex parent" property the real component
 * documents. Pill count mirrors the real header exactly: New activity
 * always, then one per enabled flag in order (Metadata / Calendar / Files /
 * Press kit / Pitch / Notes — see TasksPanel), then the two AI action pills
 * WorkspaceView appends. Widths approximate each label so the row's
 * footprint matches ("Status update", shortened 2026-08-10 to fit a chip
 * row — see WorkspaceView).
 * No left label (2026-08-05, #218 — the real row is `justify-end` only).
 * Container/wrapper classes below are kept byte-for-byte in sync with
 * TasksPanel.tsx's real row (2026-08-10 bug fix: this file's inner wrapper
 * had already drifted to `flex-wrap` when the real one had none — the
 * loading-skeleton-sync rule this file otherwise follows). */
function TasksPanelSkeleton() {
  const pillWidths = [
    'w-28', // New activity
    ...(METADATA_ENABLED ? ['w-28'] : []), // Metadata + Beta tag
    ...(CONTENT_CALENDAR_ENABLED ? ['w-28'] : []), // Calendar + Beta tag
    ...(FILES_ENABLED ? ['w-16'] : []), // Files
    ...(EPK_ENABLED ? ['w-24'] : []), // Press kit
    ...(PITCHING_ENABLED ? ['w-24'] : []), // Pitch + Beta tag
    ...(NOTES_ENABLED ? ['w-20'] : []), // Notes
    ...(STATUS_UPDATE_ENABLED ? ['w-28'] : []), // Status update
    // The Plan pill is deliberately NOT reserved. Whether it renders depends on
    // the release's activity count and whether a draft exists — data this
    // skeleton is showing precisely because it does not have it yet. Guessing
    // would make the row jump for every release that has a plan already, which
    // is most of them. Same trade the recap pill documents above.
  ];
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Sticky on mobile only (`lg:static`), same as the real row — see
          TasksPanel.tsx's header comment for why sticky must not apply
          inside the desktop locked column. Below `lg` the real row scrolls
          horizontally rather than wrapping (2026-08-10); the skeleton copies
          that shape too so its footprint matches at every width, even though
          a placeholder row never actually needs to be dragged. */}
      <div className="sticky top-16 z-10 flex shrink-0 items-center bg-bg-base pb-3 pt-1 lg:static lg:justify-end">
        <div className="no-scrollbar flex w-full items-center gap-2 overflow-x-auto -mx-4 px-4 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:m-0 lg:w-auto lg:flex-wrap lg:justify-end lg:overflow-visible lg:p-0">
          {pillWidths.map((width, index) => (
            <SkeletonBlock key={`pill-${index}`} className={`h-8 ${width} rounded-full`} />
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 pb-4 lg:overflow-hidden">
        {/* Collapsed bucket-header rows — every real bucket starts closed
            (founder call, 2026-06-11 default), so this is what the panel
            actually shows on first paint, not an arbitrary placeholder. */}
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`bucket-${index}`}
            className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <SkeletonBlock className="h-3.5 w-24" />
              <SkeletonBlock className="h-4 w-4 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
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
      {/* Motion tracker strip (label + bar + count), mirrors the real one
          (h-1.5, matching the 2026-08-04 contrast fix). */}
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-2.5 w-14" />
        <SkeletonBlock className="h-1.5 flex-1 rounded-full" />
        <SkeletonBlock className="h-2.5 w-8" />
      </div>
      <TasksPanelSkeleton />
    </div>
  );
}

/**
 * Desktop focused shape (≥ lg): mirrors `WorkspaceDesktopFocused` exactly,
 * including its VIEWPORT LOCK (2026-07-23 founder call — the page never
 * scrolls in focused mode; long rails/lists scroll inside their own
 * columns). Same fixed `h-[calc(100dvh-9.25rem-1px)]` frame and the same
 * `grid-rows-[minmax(0,1fr)] overflow-hidden` grid, plus rail widths at the
 * real breakpoints (220px at lg, 260px at xl, or the `IDENTITY_PANEL_ENABLED`
 * xl-only variant) so the center column doesn't visibly resize — or the
 * page suddenly start/stop scrolling — when content replaces the skeleton.
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
    <div className="flex h-[calc(100dvh-9.25rem-1px)] min-h-[24rem] flex-col gap-4">
      {/* Compact back button + motion tracker strip (h-1.5, matching the
          2026-08-04 contrast fix). */}
      <div className="flex shrink-0 items-center gap-4">
        <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
        <SkeletonBlock className="h-2.5 w-14" />
        <SkeletonBlock className="h-1.5 flex-1 rounded-full" />
        <SkeletonBlock className="h-2.5 w-8" />
      </div>

      <div
        className={`grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-6 overflow-hidden ${
          hideRails
            ? 'grid-cols-[minmax(0,1fr)]'
            : IDENTITY_PANEL_ENABLED
              ? 'grid-cols-[minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_220px]'
              : 'lg:grid-cols-[220px_minmax(0,1fr)_220px] xl:grid-cols-[260px_minmax(0,1fr)_260px]'
        }`}
      >
        {hideRails ? null : (
          <div
            className={`min-h-0 min-w-0 space-y-3 overflow-hidden ${IDENTITY_PANEL_ENABLED ? 'hidden xl:block' : ''}`}
          >
            {Array.from({ length: leftCount }).map((_, index) => (
              <ReleaseCardSkeleton key={`rail-left-${index}`} />
            ))}
          </div>
        )}

        {/* Center column — a plain flex-column frame, same as the real
            WorkspaceDesktopFocused (2026-08-05): TasksPanelSkeleton's own
            flex-1 stretches to fill the remaining grid-track height. No
            banner slot — the one-time NewReleaseGuide never shows during
            an initial load. */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <TasksPanelSkeleton />
        </div>

        {hideRails ? null : (
          <div
            className={`min-h-0 min-w-0 space-y-3 overflow-hidden ${IDENTITY_PANEL_ENABLED ? 'hidden xl:block' : ''}`}
          >
            {Array.from({ length: rightCount }).map((_, index) => (
              <ReleaseCardSkeleton key={`rail-right-${index}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
