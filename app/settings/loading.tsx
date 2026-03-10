export default function SettingsLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-[-180px] h-[330px] w-[330px] rounded-full bg-brand/10 blur-[130px]" />
        <div className="absolute bottom-[-220px] right-[10%] h-[370px] w-[370px] rounded-full bg-brand/8 blur-[140px]" />
      </div>
      <div className="relative mx-auto w-full max-w-3xl px-6 py-10">
        <div className="h-10 w-40 rounded-lg skeleton-shimmer" />

        <div className="mt-8 space-y-6">
          <div className="rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.58)] backdrop-blur-xl">
            <div className="h-6 w-24 rounded skeleton-shimmer" />
            <div className="mt-4 space-y-3">
              <div className="h-10 rounded-lg skeleton-shimmer" />
              <div className="h-10 rounded-lg skeleton-shimmer" />
              <div className="h-10 w-36 rounded-lg skeleton-shimmer" />
            </div>
          </div>
          <div className="rounded-3xl border border-stroke-default bg-bg-surface/95 p-6 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.58)] backdrop-blur-xl">
            <div className="h-6 w-28 rounded skeleton-shimmer" />
            <div className="mt-4 space-y-3">
              <div className="h-10 rounded-lg skeleton-shimmer" />
              <div className="h-10 rounded-lg skeleton-shimmer" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
