/**
 * A standing press kit is force-dynamic: it reads the published copy and signs
 * fresh photo URLs on every request, so an editor on a slow connection waited on
 * a database round trip with a blank tab. Same fix as /pitch/[slug].
 *
 * Dark-locked to match the page it stands in for (the .kit-island palette), so
 * there is no flash of a different ground when the kit arrives.
 */
export default function Loading() {
  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: 'var(--kit-ground)' }}>
      <main className="mx-auto max-w-2xl animate-pulse px-5 py-16 sm:px-8">
        <span className="sr-only" role="status">
          Loading the press kit
        </span>
        <div aria-hidden="true">
          <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-6 h-10 w-3/4 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-4 h-4 w-full rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-2 h-4 w-2/3 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-10 aspect-[4/3] w-full rounded-lg" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-10 h-3 w-20 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-4 h-24 w-full rounded-lg" style={{ backgroundColor: 'var(--kit-surface)' }} />
        </div>
      </main>
    </div>
  );
}
