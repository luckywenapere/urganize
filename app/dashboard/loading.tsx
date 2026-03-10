export default function DashboardLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[7%] top-[-180px] h-[330px] w-[330px] rounded-full bg-brand/10 blur-[130px]" />
        <div className="absolute bottom-[-210px] right-[8%] h-[370px] w-[370px] rounded-full bg-brand/8 blur-[140px]" />
      </div>
      <div className="relative mx-auto w-full max-w-[1120px] px-6 py-10 lg:px-10 lg:py-12">
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 rounded-lg skeleton-shimmer" />
          <div className="h-10 w-36 rounded-lg skeleton-shimmer" />
        </div>

        <section className="mt-20">
          <div className="h-12 w-48 rounded-lg skeleton-shimmer" />
          <div className="mt-8 rounded-3xl border border-stroke-default bg-bg-surface/90 p-7 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.6)] backdrop-blur-xl sm:p-9">
            <div className="space-y-3">
              <div className="h-20 rounded-xl skeleton-shimmer" />
              <div className="h-20 rounded-xl skeleton-shimmer" />
              <div className="h-20 rounded-xl skeleton-shimmer" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
