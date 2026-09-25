/**
 * The page is force-dynamic, so a reader on a weak connection waits on a real
 * database round trip with nothing on screen. /k/ and /p/ both ship without one
 * of these and the recorded incident is the same each time: a blank tab on the
 * one surface a stranger judges the product by.
 *
 * Dark-locked to match the page it stands in for, so there is no flash of a
 * different ground when the real thing arrives.
 */
export default function Loading() {
  return (
    <div className="kit-island min-h-screen" style={{ backgroundColor: 'var(--kit-ground)' }}>
      <main className="mx-auto max-w-2xl animate-pulse px-5 py-16 sm:px-8">
        <div className="h-3 w-24 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
        <div className="mt-6 flex items-center gap-4">
          <div className="h-16 w-16 rounded-full" style={{ backgroundColor: 'var(--kit-surface)' }} />
          <div className="h-9 w-52 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
        </div>
        <div className="mt-6 h-4 w-full rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
        <div className="mt-2 h-4 w-3/5 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
        <div className="mt-8 h-12 w-48 rounded-full" style={{ backgroundColor: 'var(--kit-surface)' }} />
        <div className="mt-14 h-3 w-20 rounded" style={{ backgroundColor: 'var(--kit-surface)' }} />
        <div className="mt-4 h-24 w-full rounded-lg" style={{ backgroundColor: 'var(--kit-surface)' }} />
      </main>
    </div>
  );
}
