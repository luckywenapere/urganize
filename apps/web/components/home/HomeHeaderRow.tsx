import type { HomeHeader } from '@/lib/home/types';
import { HomeBell } from './v2/HomeBell';

export function HomeHeaderRow({ header }: { header: HomeHeader }) {
  return (
    <div className="flex items-baseline justify-between gap-x-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          {header.dateLabel}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-content-primary sm:text-3xl">
          {header.greeting}, {header.firstName}.
        </h1>
      </div>
      {/* The phone's bell, top right on Home in every state (2026-10-17). */}
      <div className="-mr-1 shrink-0 self-start">
        <HomeBell />
      </div>
    </div>
  );
}
