'use client';

import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

/**
 * Content-calendar loading state, rendered inline by CalendarPageClient
 * while auth/release/calendar data are in flight (no route-segment Suspense
 * fallback for this part; same inline-swap rationale as
 * ReleaseDetailSkeleton). Matches the real page's shape: tab bar + a 5-week
 * grid of empty pulsing cells on desktop, agenda rows on mobile.
 *
 * Rendered in the same theme-aware brand island (the `cc-island` class from
 * globals.css) as the real page so there is no color flash on hydration. The font-variable classes are threaded in via
 * `className` from CalendarPageClient's next/font calls, keeping the actual
 * font loading in exactly one file.
 */

type CalendarPageSkeletonProps = {
  className?: string;
};

const GRID_CELL_COUNT = 5 * 7;
const AGENDA_ROW_COUNT = 6;

/**
 * The month-grid + agenda-list placeholder, split out (2026-08-04) so it can
 * be reused for the POSTS loading state too — previously CalendarPageClient
 * fell back to a plain "Loading posts…" string once the page shell/tabs had
 * already resolved (switching calendars, or the calendar tab's own fetch),
 * with no shape reservation at all. Same desktop-grid / mobile-agenda split
 * as the real `MonthGrid`/`AgendaList` pair.
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

export function CalendarPageSkeleton({ className = '' }: CalendarPageSkeletonProps) {
  return (
    <main
      className={`cc-island min-h-screen bg-[var(--cc-ground)] text-[var(--cc-text)] ${className}`}
      aria-hidden="true"
    >
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-10 sm:px-6">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-32" />
          <SkeletonBlock className="h-8 w-2/3" />
        </div>

        <div className="mt-6 flex items-center gap-2 border-b border-[var(--cc-border)] pb-3">
          <SkeletonBlock className="h-8 w-24" />
          <SkeletonBlock className="h-8 w-24" />
          <SkeletonBlock className="h-8 w-8" />
        </div>

        <CalendarGridSkeleton />
      </div>
    </main>
  );
}
