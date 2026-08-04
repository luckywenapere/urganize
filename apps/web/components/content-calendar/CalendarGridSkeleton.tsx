'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

const GRID_CELL_COUNT = 5 * 7;
const AGENDA_ROW_COUNT = 6;

/**
 * The content calendar's month-grid + agenda-list placeholder. Same
 * desktop-grid / mobile-agenda split as the real `MonthGrid`/`AgendaList`
 * pair, so nothing shifts when posts land.
 *
 * Two callers: `CalendarScene` for its own posts fetch (switching calendars or
 * paging months), and `ReleaseSceneOverlay` for the cold-load case where
 * someone opens a `?scene=calendar` URL before the release store has hydrated.
 *
 * Expects an ancestor carrying the `cc-island` class — it reads `--cc-border`
 * from that scope. Both callers render it inside the calendar window's panel,
 * which declares the island.
 *
 * This file was `CalendarPageSkeleton.tsx` until 2026-08-04. The full-page
 * skeleton it was named for died with the calendar's page route (the calendar
 * is an overlay window now, and the overlay host owns its loading state), so
 * the file is named for its surviving export instead.
 */
export function CalendarGridSkeleton() {
  return (
    <div className="mt-4" aria-hidden="true">
      {/* Desktop: 5-week grid of empty pulsing cells. */}
      <div className="hidden grid-cols-7 gap-px border border-[var(--cc-border)] lg:grid">
        {Array.from({ length: GRID_CELL_COUNT }).map((_, index) => (
          <SkeletonBlock key={index} className="min-h-[72px] rounded-none" />
        ))}
      </div>

      {/* Mobile: agenda rows. */}
      <div className="space-y-2 lg:hidden">
        {Array.from({ length: AGENDA_ROW_COUNT }).map((_, index) => (
          <SkeletonBlock key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
