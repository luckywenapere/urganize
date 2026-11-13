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

// ─── desktop (lg and up, #1237) ──────────────────────────────────────────────
// The same rule as above: the shapes the desktop layouts resolve into.

function DeskHeader({ action = false }: { action?: boolean }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="space-y-2">
        <Line className="h-8 w-40" />
        <Line className="h-4 w-80" />
      </div>
      {action ? <Line className="h-10 w-36 rounded-full" /> : null}
    </div>
  );
}

/** The pitch list on the left and the open pitch on the right. */
export function CuratorInboxDeskSkeleton() {
  return (
    <div
      className="grid grid-cols-[300px_minmax(0,1fr)] items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]"
      aria-busy="true"
    >
      <div className="overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 border-t border-stroke-default px-4 py-3.5 first:border-t-0"
          >
            <Line className="h-11 w-11 rounded-lg" />
            <div className="space-y-2">
              <Line className="h-4 w-2/3" />
              <Line className="h-3 w-5/6" />
            </div>
            <div className="space-y-2">
              <Line className="h-3 w-14" />
              <Line className="ml-auto h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-4 rounded-2xl border border-stroke-default bg-bg-surface p-5">
        <div className="flex items-center gap-4">
          <Line className="h-[72px] w-[72px] rounded-lg" />
          <div className="flex-1 space-y-2">
            <Line className="h-7 w-1/2" />
            <Line className="h-3 w-2/3" />
          </div>
          <Line className="h-10 w-40 rounded-full" />
        </div>
        <Line className="h-14 w-full" />
        <Line className="h-4 w-3/4" />
        <Line className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function CuratorPlaylistsTableSkeleton() {
  return (
    <div className="rounded-2xl border border-stroke-default bg-bg-surface" aria-busy="true">
      <div className="border-b border-stroke-default px-5 py-3">
        <Line className="h-3 w-48" />
      </div>
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 border-t border-stroke-default px-5 py-3 first:border-t-0">
          <Line className="h-11 w-11 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Line className="h-4 w-1/3" />
            <Line className="h-3 w-24" />
          </div>
          <Line className="h-3 w-16" />
          <Line className="h-3 w-12" />
          <Line className="h-5 w-32 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function CuratorEarningsDeskSkeleton() {
  return (
    <div aria-busy="true">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-2xl border border-stroke-default bg-bg-surface p-5">
            <Line className="h-3 w-20" />
            <Line className="h-8 w-28" />
            <Line className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3 rounded-2xl border border-stroke-default bg-bg-surface p-5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Line key={index} className="h-6 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          <Line className="h-44 w-full rounded-2xl" />
          <Line className="h-28 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/** The whole route-level fallback for a desktop curator page: shell + body. */
export function CuratorDeskPageSkeleton({ body }: { body: 'inbox' | 'playlists' | 'earnings' | 'profile' }) {
  return (
    <div className="min-h-screen">
      <div className="h-16 border-b border-stroke-default" />
      <div className="mx-auto grid w-full max-w-[1180px] grid-cols-[220px_minmax(0,1fr)] items-start gap-8 px-6 pb-12 pt-6">
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Line key={index} className="h-9 w-full rounded-[10px]" />
          ))}
        </div>
        <div>
          <DeskHeader action={body === 'playlists'} />
          {body === 'inbox' ? (
            <CuratorInboxDeskSkeleton />
          ) : body === 'playlists' ? (
            <CuratorPlaylistsTableSkeleton />
          ) : body === 'earnings' ? (
            <CuratorEarningsDeskSkeleton />
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-6">
              <Line className="h-80 w-full rounded-2xl" />
              <Line className="h-72 w-full rounded-2xl" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
