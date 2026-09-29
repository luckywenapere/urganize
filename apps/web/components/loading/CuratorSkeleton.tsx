// Loading shapes for the playlist owner surfaces. Same language as the rest of
// the app's skeletons: real row shapes at real heights, so the resolved page
// lands in the space the skeleton was already holding.

const Line = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded bg-bg-elevated ${className}`} />
);

function SectionHeader() {
  return (
    <div className="space-y-2">
      <Line className="h-3 w-24" />
      <Line className="h-6 w-40" />
      <Line className="h-4 w-full max-w-sm" />
    </div>
  );
}

/** A stack of pitch cards or playlist cards. */
export function CuratorCardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-xl border border-stroke-default bg-bg-surface p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Line className="h-4 w-2/3" />
              <Line className="h-3 w-1/3" />
            </div>
            <Line className="h-6 w-16 rounded-full" />
          </div>
          <Line className="h-3 w-full" />
          <div className="flex gap-2">
            <Line className="h-9 w-20 rounded-full" />
            <Line className="h-9 w-20 rounded-full" />
            <Line className="h-9 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CuratorInboxSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <SectionHeader />
      <div className="flex gap-2">
        <Line className="h-8 w-16 rounded-full" />
        <Line className="h-8 w-20 rounded-full" />
        <Line className="h-8 w-20 rounded-full" />
      </div>
      <CuratorCardListSkeleton />
    </div>
  );
}

export function CuratorPlaylistsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <SectionHeader />
      <Line className="h-11 w-full rounded-xl sm:w-40" />
      <CuratorCardListSkeleton rows={2} />
    </div>
  );
}

export function CuratorProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <SectionHeader />
      <div className="space-y-4 rounded-xl border border-stroke-default bg-bg-surface p-4">
        <div className="flex items-center gap-4">
          <Line className="h-16 w-16 rounded-full" />
          <Line className="h-9 w-32 rounded-xl" />
        </div>
        <Line className="h-11 w-full rounded-xl" />
        <Line className="h-24 w-full rounded-xl" />
        <Line className="h-11 w-full rounded-xl sm:w-32" />
      </div>
    </div>
  );
}

/** Curator pitch payments (2026-09-25): the bank-account card, the price card,
 *  and a few earnings rows. */
export function CuratorEarningsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <SectionHeader />
      <div className="space-y-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
        <Line className="h-4 w-40" />
        <Line className="h-11 w-full rounded-xl" />
        <Line className="h-9 w-full rounded-xl sm:w-40" />
      </div>
      <div className="space-y-3 rounded-xl border border-stroke-default bg-bg-surface p-4">
        <Line className="h-4 w-32" />
        <Line className="h-11 w-full rounded-xl" />
      </div>
      <div className="space-y-2">
        <Line className="h-4 w-28" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Line key={index} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
