'use client';

import { useSearchParams } from 'next/navigation';
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

// (The feature switches that reserved the phone's Rollout menu pill at the
// base of the panel went with the pill, Oct 18, 2026.)

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
          {isFocused ? (
            <>
              <section className="flex min-h-0 flex-1 flex-col lg:hidden">
                <MobileFocusedSkeleton panelBody={panelBody} />
              </section>
              <section className="hidden lg:block">
                <DesktopFocusedSkeleton panelBody={panelBody} />
              </section>
            </>
          ) : (
            <CatalogueSkeleton count={Math.max(3, Math.min(knownCount, 6))} />
          )}
      </div>
    </div>
  );
}

/** The Catalogue's shape (design overhaul, 2026-10-04): a page title and one
 * action, the filter row, then rows. Rows on a phone are cards; from md up they
 * are a table, as CatalogueView draws them. */
function CatalogueSkeleton({ count }: { count: number }) {
  return (
    <div className="space-y-5 pt-6">
      <div className="flex items-center justify-between gap-4">
        <SkeletonBlock className="h-9 w-40" />
        <SkeletonBlock className="h-12 w-36 rounded-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <SkeletonBlock className="h-10 w-full max-w-xs rounded-full" />
        <SkeletonBlock className="h-10 w-20 rounded-full" />
        <SkeletonBlock className="h-10 w-24 rounded-full" />
        <SkeletonBlock className="h-10 w-24 rounded-full" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, index) => (
          <SkeletonBlock key={`catalogue-row-${index}`} className="h-20 w-full rounded-2xl md:h-16" />
        ))}
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
      {/* (No dock placeholder below lg since the rollout declutter, Oct 18,
          2026: the floating Rollout menu pill went to the header's menu icon,
          so there is nothing at the base of the panel to reserve.) */}
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
      {/* The decluttered phone header (Oct 18, 2026): bare back chevron,
          artist eyebrow over the title, search and menu icons at the right,
          then the one meta line with its count and a thin bar. */}
      <div className="flex items-start gap-2">
        <SkeletonBlock className="mt-3 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <SkeletonBlock className="h-2.5 w-24" />
          <SkeletonBlock className="h-7 w-40" />
        </div>
        <SkeletonBlock className="mt-2 h-6 w-6 shrink-0 rounded-full" />
        <SkeletonBlock className="mt-2 h-6 w-6 shrink-0" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <SkeletonBlock className="h-3 w-44" />
          <SkeletonBlock className="h-3 w-14" />
        </div>
        <SkeletonBlock className="h-[3px] w-full rounded-full" />
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
