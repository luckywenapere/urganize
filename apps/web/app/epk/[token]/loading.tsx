// This route is `force-dynamic` (see page.tsx) — `loadPublicEpk` runs a
// live DB read plus fresh signed-URL minting for cover art/promo images on
// every request, so there is real wait time here. Before this file, that
// wait rendered nothing at all (default Next.js behavior: a blank tab until
// the server component resolves) — the one authenticated-feeling gap in an
// otherwise fully-skeletoned app, on the one page a press contact actually
// judges the product by. Mirrors the real page's shape and CSS custom
// properties exactly (the dark-locked `.epk-island` Brand Bible palette) so
// there is no color flash when the resolved kit swaps in.
export default function PublicEpkLoading() {
  return (
    <main
      className="epk-island min-h-screen"
      style={{ backgroundColor: 'var(--epk-ground)' }}
      aria-hidden="true"
    >
      <div className="mx-auto max-w-[720px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <div
          className="skeleton-shimmer h-2.5 w-20"
          style={{ backgroundColor: 'var(--epk-surface)' }}
        />

        {/* Cover art */}
        <div
          className="skeleton-shimmer mt-8 aspect-square w-full max-w-[420px]"
          style={{ backgroundColor: 'var(--epk-surface)', border: '1px solid var(--epk-border)' }}
        />

        {/* Artist + title */}
        <div className="mt-8 space-y-3">
          <div className="skeleton-shimmer h-3 w-40" style={{ backgroundColor: 'var(--epk-surface)' }} />
          <div className="skeleton-shimmer h-10 w-3/4" style={{ backgroundColor: 'var(--epk-surface)' }} />
          <div className="skeleton-shimmer h-3 w-32" style={{ backgroundColor: 'var(--epk-surface)' }} />
        </div>

        {/* About */}
        <div className="mt-10 space-y-2">
          <div className="skeleton-shimmer h-2.5 w-28" style={{ backgroundColor: 'var(--epk-surface)' }} />
          <div className="skeleton-shimmer h-3.5 w-full" style={{ backgroundColor: 'var(--epk-surface)' }} />
          <div className="skeleton-shimmer h-3.5 w-2/3" style={{ backgroundColor: 'var(--epk-surface)' }} />
        </div>

        {/* Release details */}
        <div className="mt-10">
          <div className="skeleton-shimmer h-2.5 w-28" style={{ backgroundColor: 'var(--epk-surface)' }} />
          <div className="mt-3 border-t" style={{ borderColor: 'var(--epk-border)' }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-6 border-b py-3.5"
                style={{ borderColor: 'var(--epk-border)' }}
              >
                <div className="skeleton-shimmer h-2.5 w-24" style={{ backgroundColor: 'var(--epk-surface)' }} />
                <div className="skeleton-shimmer h-3 w-32" style={{ backgroundColor: 'var(--epk-surface)' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
