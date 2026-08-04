// This route is `force-dynamic` (see page.tsx) — `loadPublicCreditForm` runs
// a live DB read on every request, so there is real wait time here. Before
// this file, that wait rendered nothing at all (default Next.js behavior: a
// blank tab). `CreditSubmissionForm` itself has no async loading state of
// its own (it's a static form, no fetch-before-render), so this only needs
// to bridge the token-resolution delay, not reserve per-field shape. Mirrors
// the real page's header shape and the dark-locked `.credits-island` Brand
// Bible palette so there is no color flash when the form swaps in.
export default function PublicCreditsLoading() {
  return (
    <main
      className="credits-island min-h-screen"
      style={{ backgroundColor: 'var(--credits-ground)' }}
      aria-hidden="true"
    >
      <div className="mx-auto max-w-[720px] px-5 pb-16 pt-12 sm:px-8 sm:pt-16">
        <div
          className="skeleton-shimmer h-2.5 w-40"
          style={{ backgroundColor: 'var(--credits-surface)' }}
        />

        <div className="mt-8 space-y-3">
          <div
            className="skeleton-shimmer h-3 w-40"
            style={{ backgroundColor: 'var(--credits-surface)' }}
          />
          <div
            className="skeleton-shimmer h-10 w-3/4"
            style={{ backgroundColor: 'var(--credits-surface)' }}
          />
          <div
            className="skeleton-shimmer h-3 w-32"
            style={{ backgroundColor: 'var(--credits-surface)' }}
          />
        </div>

        <div className="mt-6 max-w-[52ch] space-y-2">
          <div
            className="skeleton-shimmer h-3.5 w-full"
            style={{ backgroundColor: 'var(--credits-surface)' }}
          />
          <div
            className="skeleton-shimmer h-3.5 w-2/3"
            style={{ backgroundColor: 'var(--credits-surface)' }}
          />
        </div>

        {/* The form itself renders all at once with no internal loading gate
            — a single reserved block stands in for it rather than
            enumerating its ~15 fields, which would only need to match if the
            form had its own async state. */}
        <div
          className="skeleton-shimmer mt-8 h-96 w-full"
          style={{ backgroundColor: 'var(--credits-surface)' }}
        />
      </div>
    </main>
  );
}
