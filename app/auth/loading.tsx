export default function AuthLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base p-4 text-content-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-180px] h-[330px] w-[330px] -translate-x-1/2 rounded-full bg-brand/12 blur-[130px]" />
      </div>
      <div className="relative mx-auto flex min-h-screen w-full max-w-md items-center">
        <div className="w-full rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.58)] backdrop-blur-xl sm:p-8">
          <div className="mx-auto h-14 w-14 rounded-2xl skeleton-shimmer" />
          <div className="mt-6 space-y-3">
            <div className="skeleton-line skeleton-shimmer w-2/3" />
            <div className="skeleton-line skeleton-shimmer w-full" />
            <div className="skeleton-line skeleton-shimmer w-full" />
            <div className="skeleton-line skeleton-shimmer w-full" />
          </div>
          <div className="mt-6 h-11 w-full rounded-lg skeleton-shimmer" />
        </div>
      </div>
    </main>
  );
}
