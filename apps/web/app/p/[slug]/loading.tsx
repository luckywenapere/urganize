/**
 * A person's public record is force-dynamic, so a manager on a slow connection
 * waited on a database round trip with a blank tab. Same fix as /k/[slug] and
 * /pitch/[slug], and the same dark-locked palette as the page it stands in for.
 */
export default function Loading() {
  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: 'var(--kit-ground)' }}>
      <main className="mx-auto max-w-2xl animate-pulse px-5 py-16 sm:px-8">
        <span className="sr-only" role="status">
          Loading this profile
        </span>
        <div aria-hidden="true">
          <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-6 h-9 w-52 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-4 h-4 w-full rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-2 h-4 w-3/5 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-10 h-3 w-20 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="mt-4 h-20 w-full rounded-lg" style={{ backgroundColor: 'var(--kit-surface)' }} />
        </div>
      </main>
    </div>
  );
}
