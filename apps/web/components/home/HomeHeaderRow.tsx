import type { HomeHeader } from '@/lib/home/types';

export function HomeHeaderRow({ header }: { header: HomeHeader }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          {header.dateLabel}
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-content-primary sm:text-3xl">
          {header.greeting}, {header.firstName}.
        </h1>
      </div>
      {header.teamName ? (
        <p className="text-sm text-content-secondary">{header.teamName}</p>
      ) : null}
    </div>
  );
}
