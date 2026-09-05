'use client';

import { useSearchParams } from 'next/navigation';
import { useChappiStore } from '@/stores/useChappiStore';
import {
  METADATA_PILL_HIDE_CLASS,
  TASKS_PILL_DOCK_OFFSET_CLASS,
} from '@/components/workspace/TasksPanel';
import { SkeletonBlock } from './SkeletonBlock';
import { useKnownReleaseCount } from './known-counts';
import { resolveActiveScene } from '@/lib/scene-cache';

// Same URL param useReleaseScope reads (`?release=`). Knowing this at
// skeleton-render time (before release data has loaded) lets the skeleton
// reserve the FOCUSED 3-column shape instead of always assuming the at-rest
// grid — the two are visually very different, and landing on a scoped URL
// (a release deep link, a notification click, a refresh) is a common path.
const SCOPE_PARAM = 'release';

// Same build-time flags TasksPanel reads for its scoped-header pills. The
// skeleton renders one placeholder pill per REAL pill so the row doesn't
// change width when content swaps in: New activity is always present; Files /
// Fan capture appear per flag, in that order (2026-08-04 — the release detail
// page and its "Overview" pill were removed; Calendar left this row entirely
// on 2026-08-13, see the sticky-pill placeholder further down). Metadata
// (2026-08-12) moved to the identity panel's left-hand nav at `lg`+ (see
// WorkspaceIdentityPanel), but its pill survives BELOW `lg` (that panel never
// renders there), so it's still reserved here, just viewport-restricted like
// its real counterpart.
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';
const CAPTURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true';
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
// The Song pill sits between Metadata and Pitch in the real row.
const SONG_UPLOAD_ENABLED = process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true';
const COVER_ART_ENABLED = process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true';
// Notes' scoped-release link (TasksPanel) — added 2026-08-10; this
// reservation was missing even though the real pill has rendered behind the
// flag since Notes shipped, an existing skeleton/real mismatch found while
// fixing the mobile pill-row overflow bug. DESKTOP ONLY since 2026-08-15, so
// it is reserved in the header row and deliberately not in the mobile dock.
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';

// Timeline (2026-08-30) sits right before Metadata in the real desktop header
// row and leads the mobile top-tabs strip. Reserved unconditionally under its
// flag — unlike Plan and Recap, whether it renders depends only on a release
// being scoped, which this skeleton already knows.
const TIMELINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TIMELINE === 'true';

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
 *  - the tasks panel's pills — a right-aligned header row at lg+, one sticky
 *    wrapping dock at the panel's base below it — and its bucket-list body
 *    (`TasksPanel`)
 *
 * Large content regions (art squares, the task list area) stay static dim
 * boxes rather than shimmering — same convention as `ReleaseDetailSkeleton`
 * / `SettingsPageSkeleton`, where only short text-line placeholders animate.
 * Shimmer respects `prefers-reduced-motion` via the global rule in
 * `globals.css`.
 */
export function WorkspaceSkeleton() {
  const searchParams = useSearchParams();
  const isRailOpen = useChappiStore((state) => state.railOpen);
  // Mirrors WorkspaceView's hideRailsForLayout exactly: the rails hide while
  // ANY scene is open, and a refresh on a `?scene=…` URL used to paint
  // 3-column rails here that vanished the moment data resolved. Widened from
  // calendar-only alongside the real view (2026-08-25) — the two read the same
  // `resolveActiveScene`, so they cannot disagree about whether a stale
  // flag-off param counts as an open scene.
  const hideRails =
    (CHAPPI_ENABLED && isRailOpen) || resolveActiveScene(searchParams.get('scene')) !== null;
  const knownCount = useKnownReleaseCount();
  // `?release=` is the normal signal, but a single-release workspace scopes
  // itself in an effect, so the URL is still bare while WorkspaceView holds
  // this skeleton up waiting for that (see its loading gate). Reading the
  // last-known count keeps the skeleton on the focused shape through that
  // gap instead of flashing a catalog it is about to replace. Hydrates in an
  // effect, so SSR renders the catalog shape and the swap lands with the
  // count — same tradeoff every other count-aware skeleton here makes.
  const isFocused = Boolean(searchParams.get(SCOPE_PARAM)) || knownCount === 1;

  return (
    <main
      className="flex min-h-full flex-col bg-bg-base text-content-primary lg:block"
      aria-hidden="true"
    >
      {/* lg:pt-0 (URG-224 + URG-226), lg:px-0 (URG-231), the focused-only
          pb-0 and the below-lg flex/min-h chain (2026-08-14, the mobile pill
          dock — see WorkspaceView's comment above its own <main>) all mirror
          WorkspaceView's wrapper exactly. These class strings must stay
          byte-identical to WorkspaceView's or the skeleton shifts when data
          resolves. */}
      <div
        className={`flex min-h-0 min-w-0 flex-1 flex-col pt-6 sm:px-6 lg:block lg:px-0 lg:pt-0 ${isFocused ? 'pb-0 lg:pb-0' : 'pb-6 sm:pb-24'}`}
      >
          {/* The catalog's "Search release" bar (2026-08-31). Reserved on the
              same rule the real one renders on — the catalog is showing AND
              there is a release to find — and the wrapper classes are
              byte-identical to ReleaseSearchBar's so nothing shifts when data
              lands. Its count line ("3 of 9 releases") is NOT reserved: it only
              appears while a query is being typed, which cannot be true on the
              first paint.

              `knownCount` hydrates in an effect, so an SSR paint reserves
              nothing here and the bar arrives with the count — the same
              tradeoff every other count-aware shape in this file makes, and it
              is the honest direction: reserving a bar for an account that turns
              out to have no releases would push the "No releases yet" state
              down the page. */}
          {!isFocused && knownCount > 0 ? (
            <div className="mb-4 w-full shrink-0 lg:mx-auto lg:max-w-md">
              <SkeletonBlock className="h-11 w-full rounded-full" />
            </div>
          ) : null}

          <section className="flex min-h-0 flex-1 flex-col lg:hidden">
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

/** Tasks pills + collapsed bucket-row placeholders. Structurally mirrors
 * TasksPanel's real `<aside>` (flex column, desktop-only header row, a
 * flex-1 scrolling body, then the sticky mobile pill dock) so it can stretch to fill the locked focused
 * column on desktop, or sit inert in mobile's plain document flow — same
 * "flex-1 is inert without a flex parent" property the real component
 * documents. Pill count mirrors the real containers exactly: New activity
 * always, then one per enabled flag in order (Pitch / Files — see TasksPanel;
 * Calendar left this row 2026-08-13 and Press kit 2026-08-14, see the outbound
 * placeholders below), then Notes on DESKTOP ONLY (2026-08-15), then the AI
 * action pill WorkspaceView appends — which both containers carry.
 * Widths approximate each label so the row's footprint matches ("Status
 * update", shortened 2026-08-10 to fit a chip row — see WorkspaceView).
 * No left label (2026-08-05, #218 — the real row is `justify-end` only).
 * Container/wrapper classes below are kept byte-for-byte in sync with
 * TasksPanel.tsx's real row (2026-08-10 bug fix: this file's inner wrapper
 * had already drifted to `flex-wrap` when the real one had none — the
 * loading-skeleton-sync rule this file otherwise follows). */
function TasksPanelSkeleton() {
  const pillWidths = [
    // Cover art comes right after Metadata in the real row, before Song.
    ...(COVER_ART_ENABLED ? ['w-24'] : []), // Cover art
    // Song comes before Pitch in the real row — you cannot pitch a release
    // whose audio nobody has uploaded.
    ...(SONG_UPLOAD_ENABLED ? ['w-20'] : []), // Song
    // Pitch leads the row (founder call, 2026-08-10) and carries no Beta tag,
    // so it reserves the same width as Files rather than a tagged pill's.
    ...(PITCHING_ENABLED ? ['w-16'] : []), // Pitch
    ...(FILES_ENABLED ? ['w-16'] : []), // Files
    // The Plan pill is deliberately NOT reserved. Whether it renders depends on
    // the release's activity count and whether a draft exists — data this
    // skeleton is showing precisely because it does not have it yet. Guessing
    // would make the row jump for every release that has a plan already, which
    // is most of them. Same trade the recap pill documents above.
  ];
  // The header row's pills (New activity, Timeline, Metadata, then one per
  // enabled flag). DESKTOP ONLY — the real buttons these stand in for stopped
  // rendering below `lg` on 2026-08-31, when the mobile top tabs were folded
  // into the release menu, so there is no second container to feed. (This
  // comment described them as shared by "both layouts" for a while after the
  // real component had already stopped doing that.)
  const primaryPillBlocks = (
    <>
      <SkeletonBlock className="h-8 w-28 shrink-0 rounded-full" />
      {TIMELINE_ENABLED ? (
        <SkeletonBlock className="h-8 w-24 shrink-0 rounded-full" />
      ) : null}
      {/* Metadata — narrow widths only, carrying the SAME hide class the
          real pill computes (see TasksPanel.tsx's METADATA_PILL_HIDE_CLASS:
          empty when the identity panel is flagged off, else xl/lg depending
          on Chappi) so the reserved footprint matches at every breakpoint.
          w-24 since the 2026-08-31 rename from "Collect metadata" — eight
          characters in a pill with a 14px icon. It used to be described as
          "the same width as Calendar"; that pill's label shortened to
          "Content" later the same day, so Metadata is now the wider of the
          two and keeps w-24 on its own merit. */}
      {METADATA_ENABLED ? (
        <SkeletonBlock className={`h-8 w-24 shrink-0 rounded-full ${METADATA_PILL_HIDE_CLASS}`} />
      ) : null}
      {pillWidths.map((width, index) => (
        <SkeletonBlock key={`pill-${index}`} className={`h-8 ${width} shrink-0 rounded-full`} />
      ))}
    </>
  );
  // Notes is DESKTOP ONLY (founder call, 2026-08-15), mirroring the real
  // `notesPill` — reserved in the header row and nowhere else.
  const notesPillBlock = NOTES_ENABLED ? (
    <SkeletonBlock className="h-8 w-20 shrink-0 rounded-full" />
  ) : null;
  // WorkspaceView's `extraActions` (Status update), which BOTH containers
  // render — so this is reserved in both, after Notes on desktop to match the
  // real Files -> Notes -> AI actions order. The recap pill stays unreserved
  // for the reason given above.
  const extraActionPillBlocks = STATUS_UPDATE_ENABLED ? (
    <SkeletonBlock className="h-8 w-28 shrink-0 rounded-full" />
  ) : null;
  // Content / Fan capture — the panel's outbound group, a
  // desktop-only footer row at lg+. It used to describe itself as also being
  // "the tail of the mobile dock"; the dock has carried no pills since
  // 2026-08-17 and, since 2026-08-31, these reach a phone only through
  // the release menu, which reserves nothing per entry. Press kit left this
  // row entirely on 2026-09-05, when the release-scoped EPK was retired for
  // the standing per-artist kit.
  // NO pill in this row carries a Beta tag any more (Calendar lost its stamp
  // 2026-08-15, the other two on 2026-08-16), so each width is now just its
  // label: px-3 + a 14px icon + gap-1.5 + the text at 12px semibold. Widths
  // are per-label rather than uniform, and each rounds DOWN to the nearest
  // step: a placeholder wider than the real pill shifts every neighbour left
  // when the labels arrive, where a narrower one shifts them right, which is
  // the tolerated direction.
  //
  // Content (was "Calendar" until 2026-08-31) is the shorter of the two at
  // seven characters and steps down to w-20 accordingly — at w-24 it would
  // have been the one case this row forbids, a placeholder wider than the pill
  // it stands in for. Fan capture keeps w-28 as the longer.
  const outboundPillBlocks = (
    <>
      {CONTENT_CALENDAR_ENABLED ? <SkeletonBlock className="h-8 w-20 shrink-0 rounded-full" /> : null}
      {CAPTURE_ENABLED ? <SkeletonBlock className="h-8 w-28 shrink-0 rounded-full" /> : null}
    </>
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Desktop header row — `hidden lg:flex`, matching the real row's
          wrapper classes byte-for-byte (2026-08-14: the row stopped being
          sticky-on-mobile when every pill moved to the dock at the panel's
          base; see TasksPanel.tsx's header comment). */}
      <div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 pb-3 pt-1 lg:flex">
        {primaryPillBlocks}
        {notesPillBlock}
        {extraActionPillBlocks}
      </div>
      <div className="min-h-0 flex-1 space-y-3 pb-4 lg:overflow-hidden">
        {/* Collapsed bucket-header rows — every real bucket starts closed
            (founder call, 2026-06-11 default), so this is what the panel
            actually shows on first paint, not an arbitrary placeholder.
            Back to THREE (2026-08-15): empty groups don't render again, so the
            count depends on the data. Three is the typical occupied-group
            count for a release in flight, and under-reserving grows the list
            downward rather than shifting anything already placed. */}
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`bucket-${index}`}
            className="overflow-hidden rounded-xl border border-stroke-default bg-bg-surface"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <SkeletonBlock className="h-3.5 w-24 shrink-0" />
              {/* Started-share bar placeholder — mirrors the real header's
                  flex-1 Motion-pattern bar (TasksPanel, 2026-08-14). */}
              <SkeletonBlock className="h-1.5 min-w-0 flex-1 rounded-full" />
              <SkeletonBlock className="h-4 w-4 shrink-0 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
      {/* Desktop footer placeholders — Calendar (2026-08-13) and
          Fan capture (2026-08-14); see the real block's comment in
          TasksPanel.tsx for the full history of those moves out of the header
          pill row. A sibling
          AFTER the flex-1 body, matching the real row's wrapper classes
          exactly, so the reserved footprint sits pinned at the panel's base
          and doesn't shift when content resolves. */}
      {CONTENT_CALENDAR_ENABLED || CAPTURE_ENABLED ? (
        <div className="hidden shrink-0 items-center gap-2 pb-2 pt-3 lg:flex">
          {outboundPillBlocks}
        </div>
      ) : null}
      {/* The mobile top-tabs strip reserved here (Content / Metadata / Pitch,
          plus Timeline once that flag landed) went away with the real row on
          2026-08-31 — founder call, everything moved into the release menu at
          the base of the panel. Nothing replaces its footprint: the panel's
          body simply starts higher on a phone now. */}
      {/* Mobile base dock (below `lg`) — the two icon-button placeholders for
          the search and menu controls. The row used to also reserve New
          activity and Pitch as permanent standalone pills; both went in
          2026-08-17 (Pitch to the top tabs, then — with those gone — into the
          menu; New activity retired outright, superseded by MobileNavBar's
          center "+", which this skeleton has no reason to reserve for since it
          isn't part of this panel). No border or background of its own
          (2026-08-17 correction: the row used to carry both, which read as a
          boxed rectangle sitting under the pills).

          The two controls are reserved on DIFFERENT rules as of 2026-08-31,
          when they stopped opening the same panel (see TasksPanel's base-dock
          block):

          - SEARCH is unconditional. It renders whenever the release has any
            activity, and a playbook release has 64-113 of them, so "always"
            is a far better guess than any flag combination — the skeleton has
            no task data to check. A genuinely activity-less release (the
            planner's plan-first flow) briefly reserves one 32px circle that
            never arrives, the same magnitude of imprecision Plan and Recap
            already accept below.
          - THE MENU keeps a flag-known check, but it now spans every release
            surface rather than the six that were folded away — Timeline,
            Content, Pitch and Metadata joined the list the day the top tabs
            were removed, so leaving them out of this condition would have
            un-reserved the trigger in exactly the flag combination production
            runs (calendar + metadata on, the asset flags off). Plan and Recap
            stay excluded for the reason Plan is excluded from `pillWidths`
            above: whether either renders depends on release/draft/task data
            this skeleton doesn't have yet. */}
      <div
        className={`sticky z-20 -mx-4 flex items-center gap-2 px-4 pb-3 pt-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:hidden ${TASKS_PILL_DOCK_OFFSET_CLASS}`}
      >
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
          {TIMELINE_ENABLED ||
          CONTENT_CALENDAR_ENABLED ||
          PITCHING_ENABLED ||
          METADATA_ENABLED ||
          COVER_ART_ENABLED ||
          SONG_UPLOAD_ENABLED ||
          FILES_ENABLED ||
          STATUS_UPDATE_ENABLED ||
          CAPTURE_ENABLED ? (
            <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
          ) : null}
        </div>
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
    // `flex min-h-0 flex-1 flex-col` carries the height chain the real mobile
    // branch has (its back header / Motion strip / TasksPanel are direct flex
    // children of the section) so the panel skeleton's pill dock reserves the
    // viewport floor, exactly where the real one lands.
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
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
