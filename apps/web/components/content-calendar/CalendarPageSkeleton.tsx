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

        {/* Desktop: 5-week grid of empty pulsing cells. */}
        <div className="mt-6 hidden grid-cols-7 gap-px border border-[var(--cc-border)] lg:grid">
          {Array.from({ length: GRID_CELL_COUNT }).map((_, index) => (
            <SkeletonBlock key={index} className="min-h-[72px] rounded-none" />
          ))}
        </div>

        {/* Mobile: agenda rows. */}
        <div className="mt-6 space-y-2 lg:hidden">
          {Array.from({ length: AGENDA_ROW_COUNT }).map((_, index) => (
            <SkeletonBlock key={index} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </main>
  );
}
