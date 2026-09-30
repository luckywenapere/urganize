'use client';

import { Search, X } from '@/components/icons';

type ReleaseSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  /** How many releases the current query is showing, and out of how many.
   *  Rendered only while filtering, so the bar can say what it did. */
  matchCount: number;
  totalCount: number;
};

/**
 * The catalog's search bar (2026-08-31, founder request: "a search bar at the
 * top of the catalog view… an actual bar to be able to search for releases —
 * label as so 'search release'"). Rendered ONCE by WorkspaceView above both
 * catalog branches, so it appears on a phone and on a desktop from one piece of
 * markup and the two cannot drift apart.
 *
 * Four things worth knowing:
 *
 * 1. It is an ALWAYS-VISIBLE bar, not an icon that opens a field. That is the
 *    difference between this and the mobile dock's search surface, and it is
 *    what was asked for — a catalog is a list you filter, so the control that
 *    filters it belongs on screen with it.
 *
 * 2. NO `autoFocus`, deliberately, and the reasoning is the opposite of the
 *    dock's. There, focusing on open is right because a tap on a Search button
 *    is an unambiguous "I want to type". Here the bar is simply present on the
 *    page, and stealing focus on arrival would put the phone keyboard over the
 *    catalog every single time someone opened the app.
 *
 * 3. `text-lg` is load-bearing rather than cosmetic: iOS Safari zooms the whole
 *    page when a field UNDER 16px takes focus, and this project's type scale
 *    (packages/config/tailwind/preset.js) redefines `base` to 14px — `lg` is
 *    the first step in THIS preset that clears the threshold. A previous fix
 *    elsewhere shipped as `text-base` and the zoom kept happening.
 *
 * 4. Full width below `lg`, centred and capped at `lg`+. The mobile catalog is
 *    full-width rows so a full-width bar matches them; the desktop catalog is a
 *    centred grid (`mx-auto max-w-[1008px]`, `justify-center`), and
 *    WorkspaceDesktopGrid's own history records that left-anchored chrome above
 *    that centred row "read as misaligned" (founder call, 2026-07-23). A
 *    centred field agrees with it at any card count.
 */
export function ReleaseSearchBar({
  value,
  onChange,
  matchCount,
  totalCount,
}: ReleaseSearchBarProps) {
  const filtering = value.trim().length > 0;

  return (
    // `shrink-0` matters: below `lg` this renders as a flex child of
    // WorkspaceView's column, beside a `flex-1` sibling, so without it a short
    // viewport compresses the field below its own h-11 — the same way a pill
    // without it breaks its label mid-phrase (see taskPanelPillClass).
    <div className="mb-4 w-full shrink-0 lg:mx-auto lg:max-w-md">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
          aria-hidden="true"
        />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search rollout"
          aria-label="Search rollout"
          className="motion-focus h-11 w-full rounded-full border border-stroke-control bg-bg-surface pl-10 pr-10 text-lg text-content-primary placeholder:text-content-tertiary"
        />
        {filtering ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="motion-focus absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 touch-manipulation place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {/* Announced politely so a screen reader hears the count change as the
          user types, rather than only on focus. */}
      {filtering ? (
        <p
          className="mt-2 px-3 text-[11px] text-content-tertiary"
          role="status"
          aria-live="polite"
        >
          {matchCount} of {totalCount} {totalCount === 1 ? 'rollout' : 'rollouts'}
        </p>
      ) : null}
    </div>
  );
}
