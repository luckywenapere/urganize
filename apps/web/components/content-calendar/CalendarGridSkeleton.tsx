'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

const WEEK_ROW_COUNT = 5;
const AGENDA_ROW_COUNT = 6;

/**
 * The content calendar's month-grid + agenda-list placeholder. Same
 * wide-grid / narrow-agenda split as the real `MonthGrid`/`AgendaList` pair —
 * including their container-width swap classes (`cc-month-view` /
 * `cc-agenda-view`) and the real grid's `56px_repeat(7,1fr)` template with a
 * weekday header row, so nothing reflows when posts land (the earlier
 * `grid-cols-7` shape shifted every column sideways and jumped a row).
 *
 * One caller: `CalendarScene`, for its posts fetch (first load, switching
 * calendars, or paging months).
 *
 * Expects an ancestor carrying the `cc-island` class — it reads `--cc-border`
 * from that scope — and the `cc-scene-container` container scope for the view
 * swap. CalendarScene's wrapper declares both.
 *
 * This file was `CalendarPageSkeleton.tsx` until 2026-08-04. The full-page
 * skeleton it was named for died with the calendar's page route (the calendar
 * is an inline scene now, and the scene host owns its loading state), so the
 * file is named for its surviving export instead.
 */
export function CalendarGridSkeleton() {
  return (
    <div className="mt-4" aria-hidden="true">
      {/* Wide columns: weekday header row + 5 week rows, each a 56px
          week-label gutter + 7 day cells — the real MonthGrid's template. */}
      <div className="cc-month-view">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-px border border-[var(--cc-border)]">
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonBlock key={`header-${index}`} className="h-8 rounded-none" />
          ))}
          {Array.from({ length: WEEK_ROW_COUNT * 8 }).map((_, index) => (
            <SkeletonBlock key={`cell-${index}`} className="min-h-[72px] rounded-none [@media(min-width:1024px)_and_(max-height:900px)]:min-h-[56px]" />
          ))}
        </div>
      </div>

      {/* Narrow columns: agenda rows. */}
      <div className="cc-agenda-view">
        <div className="space-y-2">
          {Array.from({ length: AGENDA_ROW_COUNT }).map((_, index) => (
            <SkeletonBlock key={index} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
