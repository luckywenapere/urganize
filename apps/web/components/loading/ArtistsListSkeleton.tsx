/**
 * The artist list's loading shape (tab jump fix, Oct 18, 2026): one card,
 * three 64px rows with the face and the name, so nothing moves when it lands.
 *
 * Shared since Oct 30, 2026: the list draws it while the roster loads, and
 * app/dashboard/loading.tsx draws it (with the list's top spacer) as Home's
 * server-rendered first paint, now that Home lives at /dashboard.
 */
export function ArtistsListSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stroke-default bg-bg-surface" aria-busy="true">
      <ul className="divide-y divide-stroke-subtle">
        {[0, 1, 2].map((key) => (
          <li key={key} className="flex h-16 items-center gap-4 pl-5 pr-5">
            <span className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-bg-hover" />
            <span className="min-w-0 flex-1 space-y-1.5">
              <span className="block h-4 w-32 animate-pulse rounded bg-bg-hover" />
              <span className="block h-3 w-16 animate-pulse rounded bg-bg-hover md:hidden" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
