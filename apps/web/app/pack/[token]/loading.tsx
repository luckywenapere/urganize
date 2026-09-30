/**
 * A DJ pack link is opened backstage, on a phone, often on poor signal, by
 * someone with no account. The page is force-dynamic and reads a live row, so
 * they used to stare at a blank tab. Matches PackShell's ground so nothing
 * flashes when the real pack arrives.
 */
export default function Loading() {
  return (
    <main className="min-h-dvh animate-pulse bg-[#0d120e] px-5 py-10 text-[#e8efe9]">
      <div className="mx-auto w-full max-w-xl">
        <span className="sr-only" role="status">
          Loading your tracks
        </span>
        <div aria-hidden="true">
          <div className="h-3 w-24 rounded bg-white/10" />
          <div className="mt-3 h-8 w-2/3 rounded bg-white/10" />
          <div className="mt-6 h-4 w-1/2 rounded bg-white/10" />
          <div className="mt-8 space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-16 w-full rounded-lg border border-white/10 bg-white/[0.03]" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
