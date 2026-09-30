'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { TASKS_PILL_DOCK_OFFSET_CLASS } from '@/components/workspace/TasksPanel';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { RolloutMenuSkeletonPortal } from './RolloutMenuSkeleton';
import { SkeletonBlock } from './SkeletonBlock';
import { useKnownReleaseCount } from './known-counts';
import {
  resolvePanelBody,
  type ReleaseMainView,
  type SceneName,
} from '@/lib/scene-cache';

// Same URL param useReleaseScope reads (`?release=`). Knowing this at
// skeleton-render time (before release data has loaded) lets the skeleton
// reserve the FOCUSED shape instead of always assuming the at-rest grid — the
// two are visually very different, and landing on a scoped URL (a release deep
// link, a notification click, a refresh) is a common path.
const SCOPE_PARAM = 'release';

/** What `resolvePanelBody` answers: a scene, or one of the two main views. */
type PanelBody = SceneName | ReleaseMainView;

// The feature switches below decide ONE thing now: whether the phone's release
// menu trigger is reserved at the base of the panel (its rows are every one of
// these, plus Share). They used to also size a row of placeholder pills at the
// top of the desktop panel and a footer row under it. Both rows became the
// rollout menu, a card at the top of the right-hand column (2026-09-30), and
// that card's placeholder counts its own rows from the real builder — see
// RolloutMenuSkeleton.tsx.
const METADATA_ENABLED = process.env.NEXT_PUBLIC_FEATURE_METADATA === 'true';
const CONTENT_CALENDAR_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CONTENT_CALENDAR === 'true';
const FILES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_FILES === 'true';
const CAPTURE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CAPTURE === 'true';
const PITCHING_ENABLED = process.env.NEXT_PUBLIC_FEATURE_PITCHING === 'true';
const SONG_UPLOAD_ENABLED = process.env.NEXT_PUBLIC_FEATURE_SONG_UPLOAD === 'true';
const COVER_ART_ENABLED = process.env.NEXT_PUBLIC_FEATURE_COVER_ART === 'true';
const NOTES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NOTES === 'true';
const RELEASE_CHAT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_RELEASE_CHAT === 'true';
const SOCIAL_SHARE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_SOCIAL_SHARE === 'true';
const TIMELINE_ENABLED = process.env.NEXT_PUBLIC_FEATURE_TIMELINE === 'true';

// Two pills used to be reserved at the end of the old desktop header row, and
// BOTH were removed on 2026-09-07 (founder calls): the status update first, then
// the release recap. Both features live in the UrgAns conversation now — you ask
// for them and it answers, the recap by putting the poster inline — so neither
// has a placeholder, and neither NEXT_PUBLIC_FEATURE_STATUS_UPDATE nor
// NEXT_PUBLIC_FEATURE_RELEASE_RECAP is read here at all.

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
 *    `sm:hidden` full-width "New rollout" button), desktop centered auto-fit
 *    up to 4-up capped at 1008px (`WorkspaceDesktopGrid`) — each card slot
 *    shaped like `WorkspaceReleaseCard`'s tile variant (square art + meta
 *    block, including the Motion label row above the progress bar)
 *  - the FOCUSED shape when `?release=` is present: mobile back-header +
 *    task list (`WorkspaceView`'s mobile branch), desktop the
 *    viewport-locked single-column frame (`WorkspaceDesktopFocused`), with the
 *    rollout menu's placeholder drawn into the right-hand column by
 *    `RolloutMenuSkeletonPortal` (2026-09-30: the rails and the row of scene
 *    pills are gone, the menu is a card above the UrgAns chat) — the page never
 *    scrolls there, so this skeleton reserves the same
 *    `h-[calc(100dvh-9.25rem-1px)]` height instead of a shorter unbounded stack
 *  - the tasks panel's phone dock — the search and menu buttons at the panel's
 *    base, below lg — and its bucket-list body (`TasksPanel`)
 *
 * Large content regions (art squares, the task list area) stay static dim
 * boxes rather than shimmering — same convention as `ReleaseDetailSkeleton`
 * / `SettingsPageSkeleton`, where only short text-line placeholders animate.
 * Shimmer respects `prefers-reduced-motion` via the global rule in
 * `globals.css`.
 */
export function WorkspaceSkeleton() {
  const searchParams = useSearchParams();
  // ONE read, threaded to every consumer below: the body decision and the
  // "is a New activity button coming" decision have to be the same value or the
  // skeleton contradicts itself — which is what it did until 2026-09-08, hiding
  // the rails for a scene and then reserving a timeline body underneath. (The
  // rails are gone since 2026-09-30, but the rule stands: read the param once.)
  const panelBody = resolvePanelBody(searchParams.get('scene'));
  const pathname = usePathname();
  const isDesktopViewport = useIsDesktopViewport();
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
    <div
      className="flex min-h-full flex-col text-content-primary lg:block"
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
              <MobileFocusedSkeleton panelBody={panelBody} />
            ) : (
              <ReleaseRowListSkeleton count={Math.min(knownCount, 6)} />
            )}
          </section>

          <section className="hidden lg:block">
            {isFocused ? (
              <DesktopFocusedSkeleton panelBody={panelBody} />
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

          {/* The rollout menu's placeholder, drawn into the right-hand column.
              Only where a menu is genuinely coming: a desktop viewport (the
              phone's menu is a hamburger, which reserves nothing here), on
              /dashboard itself (this skeleton is also the segment fallback for
              the pages under it, some of which carry a `?release=` of their
              own, like the notes page), and on a rollout. Reserving a column
              anywhere else would open a blank strip for nothing. */}
          {isFocused && isDesktopViewport && pathname === '/dashboard' ? (
            <RolloutMenuSkeletonPortal />
          ) : null}
      </div>
    </div>
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

/** At-rest MOBILE surface (2026-08-07): the full-width "New rollout" button
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

/** The activity list's placeholders. Structurally mirrors TasksPanel's real
 * `<aside>` (flex column, a flex-1 scrolling body, then the sticky mobile pill
 * dock) so it can stretch to fill the locked focused column on desktop, or sit
 * inert in mobile's plain document flow — same "flex-1 is inert without a flex
 * parent" property the real component documents.
 *
 * It carried a right-aligned header row of placeholder pills at lg+ and a
 * footer row of two more until 2026-09-30, when those became the rollout menu in
 * the right-hand column (see RolloutMenuSkeleton). Nothing here reserves them
 * any more: the real panel stopped rendering them, and a placeholder for a row
 * that no longer exists would push the list down and then snap it back up when
 * the real one arrived. */
function TasksPanelSkeleton({ panelBody }: { panelBody: PanelBody }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 pb-4 lg:overflow-hidden">
        {/* Which body is coming. The timeline paints a legend strip and then
            week groups, nothing like the bucket cards, so reserving the wrong
            one is a guaranteed shift on first data. */}
        {(() => {
          // Read the REAL `?scene=` param, not just the main view: the two
          // disagreeing is what made every scene URL reserve a timeline (or
          // bucket) body and then paint a scene over it. A scene gets a neutral
          // block: its own section owns the internal skeleton, so guessing its
          // shape here would just be a second wrong answer.
          const body = panelBody;
          if (body === 'timeline') return <TimelineBodySkeleton />;
          if (body === 'activities') return <BucketBodySkeleton />;
          return <SceneBodySkeleton />;
        })()}
      </div>
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
            never arrives, the same magnitude of imprecision Recap already
            accepts below.
          - THE MENU keeps a flag-known check, but it now spans every release
            surface rather than the six that were folded away — Timeline,
            Content, Pitch and Metadata joined the list the day the top tabs
            were removed, so leaving them out of this condition would have
            un-reserved the trigger in exactly the flag combination production
            runs (calendar + metadata on, the asset flags off). Notes joined
            2026-09-08 with the "Note this" entry. Recap stays excluded:
            whether it renders depends on release/task data this skeleton
            doesn't have yet. */}
      <div
        className={`sticky z-20 -mx-4 flex items-center gap-2 px-4 pb-3 pt-3 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:hidden ${TASKS_PILL_DOCK_OFFSET_CLASS}`}
      >
        {/* `mx-auto`, matching the real row's centring (founder call,
            2026-09-05) — a right-aligned placeholder pair would slide to the
            middle the instant the real controls arrived. */}
        <div className="mx-auto flex shrink-0 items-center gap-2">
          <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
          {TIMELINE_ENABLED ||
          CONTENT_CALENDAR_ENABLED ||
          PITCHING_ENABLED ||
          METADATA_ENABLED ||
          NOTES_ENABLED ||
          COVER_ART_ENABLED ||
          SONG_UPLOAD_ENABLED ||
          FILES_ENABLED ||
          CAPTURE_ENABLED ||
          RELEASE_CHAT_ENABLED ||
          SOCIAL_SHARE_ENABLED ? (
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
function MobileFocusedSkeleton({ panelBody }: { panelBody: PanelBody }) {
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
      <TasksPanelSkeleton panelBody={panelBody} />
    </div>
  );
}

/**
 * Desktop focused shape (≥ lg): mirrors `WorkspaceDesktopFocused` exactly,
 * including its VIEWPORT LOCK (2026-07-23 founder call — the page never
 * scrolls in focused mode; a long list scrolls inside its own column). Same
 * fixed `h-[calc(100dvh-9.25rem-1px)]` frame, so the page doesn't suddenly
 * start or stop scrolling when content replaces the skeleton.
 *
 * It was a three-column grid with two rails of other-release placeholders until
 * 2026-09-30 and is one centre column now, like the real one: the rails went
 * with the row of scene pills, and the menu that replaced the pills is a card in
 * the right-hand column that RolloutMenuSkeletonPortal fills.
 */
function DesktopFocusedSkeleton({ panelBody }: { panelBody: PanelBody }) {
  // The New activity button is only there while the main view is showing, the
  // real component's own rule. A named scene has taken the panel otherwise.
  const showNewActivity = panelBody === 'timeline' || panelBody === 'activities';
  return (
    <div className="flex h-[calc(100dvh-9.25rem-1px)] min-h-[24rem] flex-col gap-4">
      {/* Compact back button + motion tracker strip (h-1.5, matching the
          2026-08-04 contrast fix) + the New activity button at the far end.
          w-28 for the button: px-3 + a 14px icon + gap-1.5 + "New activity" at
          11px semibold comes to roughly 114px, and a placeholder rounds DOWN,
          because one wider than the real pill shifts the tracker left when the
          label arrives where a narrower one shifts it right. */}
      <div className="flex shrink-0 items-center gap-4">
        <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
        <SkeletonBlock className="h-2.5 w-14" />
        <SkeletonBlock className="h-1.5 flex-1 rounded-full" />
        <SkeletonBlock className="h-2.5 w-8" />
        {showNewActivity ? <SkeletonBlock className="h-8 w-28 shrink-0 rounded-full" /> : null}
      </div>

      {/* Centre column — a plain flex-column frame, same as the real
          WorkspaceDesktopFocused: TasksPanelSkeleton's own flex-1 stretches to
          fill the remaining height, and `overflow-hidden` holds the viewport
          lock. No banner slot — the one-time NewReleaseGuide never shows during
          an initial load. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <TasksPanelSkeleton panelBody={panelBody} />
      </div>
    </div>
  );
}


/** Collapsed bucket-header rows — every real bucket starts closed (founder
 * call, 2026-06-11 default), so this is what the panel actually shows on first
 * paint, not an arbitrary placeholder. THREE (2026-08-15): empty groups don't
 * render, so the count depends on data. Three is the typical occupied-group
 * count for a release in flight, and under-reserving grows the list downward
 * rather than shifting anything already placed. */
function BucketBodySkeleton() {
  return (
    <>
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
    </>
  );
}

/** The timeline's first paint: a legend strip, then week groups.
 *
 * Deliberately shaped after the NARROW week list rather than the wide grid.
 * The grid needs a measured axis to mean anything, and a fake one would be a
 * bigger lie than a slightly short list — and under-reserving grows downward,
 * which is the direction this file already prefers. Phases render EXPANDED as
 * of 2026-09-06, so this reserves real rows rather than collapsed headers. */
/** A scene is coming, and which one is not this file's business — every scene
 * section renders its own internal skeleton the moment it mounts. Reserving the
 * header block and one body slab keeps the column from collapsing to nothing
 * and then jumping, without pretending to know the shape. */
function SceneBodySkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <SkeletonBlock className="h-6 w-40 rounded-md" />
      <SkeletonBlock className="h-4 w-64 rounded-md" />
      <SkeletonBlock className="h-64 w-full rounded-xl" />
    </div>
  );
}

function TimelineBodySkeleton() {
  return (
    <>
      {/* Literal class strings, not interpolated: Tailwind extracts by static
          scan, so a `w-${n}` template produces a class that exists nowhere in
          the compiled stylesheet and silently renders at zero width. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SkeletonBlock className="h-2.5 w-16 shrink-0 rounded-full" />
        <SkeletonBlock className="h-2.5 w-20 shrink-0 rounded-full" />
        <SkeletonBlock className="h-2.5 w-16 shrink-0 rounded-full" />
        <SkeletonBlock className="h-2.5 w-14 shrink-0 rounded-full" />
      </div>
      {Array.from({ length: 3 }).map((_, group) => (
        <div key={`tl-week-${group}`} className="space-y-2 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <SkeletonBlock className="h-3 w-28 shrink-0" />
            <SkeletonBlock className="h-2.5 w-16 shrink-0" />
          </div>
          {Array.from({ length: 3 }).map((__, row) => (
            <div key={`tl-row-${group}-${row}`} className="flex items-center gap-2 px-2 py-1.5">
              <SkeletonBlock className="h-2.5 w-2.5 shrink-0 rounded-full" />
              <SkeletonBlock className="h-3 min-w-0 flex-1" />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
