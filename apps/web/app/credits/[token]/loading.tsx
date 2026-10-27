// This route is `force-dynamic` (see page.tsx) — `loadPublicCreditForm` runs
// a live DB read on every request, so there is real wait time here. Before
// this file, that wait rendered nothing at all (default Next.js behavior: a
// blank tab). `CreditSubmissionForm` itself has no async loading state of
// its own (it's a static form, no fetch-before-render), so this only needs
// to bridge the token-resolution delay. Mirrors the real page's shape (the
// 2026-10-27 sleek layout: wordmark row, title, three fields, chips, button)
// on the dark-locked `.credits-island` palette so there is no flash when the
// form swaps in.
export default function PublicCreditsLoading() {
  const block = { backgroundColor: 'var(--credits-surface)' };
  return (
    <main
      className="credits-island min-h-screen"
      style={{ backgroundColor: 'var(--credits-ground)' }}
      aria-hidden="true"
    >
      <div className="mx-auto max-w-[460px] px-5 pb-16 pt-8 sm:pt-12">
        <div className="flex items-center justify-between">
          <div className="skeleton-shimmer h-5 w-20 rounded" style={block} />
          <div className="skeleton-shimmer h-3 w-12 rounded" style={block} />
        </div>

        <div className="mt-12 space-y-2">
          <div className="skeleton-shimmer h-3.5 w-40 rounded" style={block} />
          <div className="skeleton-shimmer h-10 w-2/3 rounded" style={block} />
          <div className="skeleton-shimmer mt-3 h-3.5 w-4/5 rounded" style={block} />
        </div>

        <div className="mt-8 grid gap-2.5">
          <div className="skeleton-shimmer h-12 w-full rounded-xl" style={block} />
          <div className="skeleton-shimmer h-12 w-full rounded-xl" style={block} />
          <div className="skeleton-shimmer h-12 w-full rounded-xl" style={block} />
        </div>

        <div className="mt-8 flex flex-wrap gap-1.5">
          {[24, 20, 18, 28, 20].map((width, index) => (
            <div
              key={index}
              className="skeleton-shimmer h-9 rounded-full"
              style={{ ...block, width: `${width * 4}px` }}
            />
          ))}
        </div>

        <div className="skeleton-shimmer mt-10 h-12 w-full rounded-xl" style={block} />
      </div>
    </main>
  );
}
