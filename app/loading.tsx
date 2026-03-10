export default function RootLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 left-8 h-72 w-72 rounded-full bg-brand/12 blur-[110px]" />
        <div className="absolute -bottom-24 right-8 h-72 w-72 rounded-full bg-brand/10 blur-[120px]" />
      </div>
      <div className="relative mx-auto flex min-h-screen w-full max-w-[980px] items-center justify-center px-6">
        <div className="soft-loading-shell w-full max-w-md rounded-3xl border border-stroke-default/80 bg-bg-surface/90 p-6 shadow-[0_18px_60px_-34px_rgba(0,0,0,0.55)] backdrop-blur-xl">
          <div className="skeleton-shimmer h-10 w-44 rounded-xl" />
          <div className="mt-5 space-y-3">
            <div className="skeleton-line skeleton-shimmer w-full rounded-full" />
            <div className="skeleton-line skeleton-shimmer w-4/5 rounded-full" />
          </div>
        </div>
      </div>
    </main>
  );
}
