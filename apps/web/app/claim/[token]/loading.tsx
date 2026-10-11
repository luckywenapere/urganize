// What shows while a claim link resolves. The same frame as the real page, so
// nothing jumps when it arrives.
export default function ClaimLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-6 py-16 sm:py-24" aria-busy="true">
      <div className="h-9 w-3/4 animate-pulse rounded-lg bg-stroke-strong" />
      <div className="mt-4 h-6 w-1/2 animate-pulse rounded-lg bg-stroke-strong" />
      <div className="mt-4 h-16 w-full animate-pulse rounded-lg bg-stroke-strong" />
    </main>
  );
}
