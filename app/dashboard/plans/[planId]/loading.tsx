export default function PlanLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-[-190px] h-[350px] w-[350px] rounded-full bg-brand/10 blur-[135px]" />
        <div className="absolute bottom-[-230px] right-[9%] h-[390px] w-[390px] rounded-full bg-brand/8 blur-[145px]" />
      </div>
      <div className="relative mx-auto w-full max-w-[1120px] px-6 py-10 lg:px-10 lg:py-12">
        <div className="flex items-center justify-between">
          <div className="h-5 w-28 rounded skeleton-shimmer" />
          <div className="h-5 w-16 rounded skeleton-shimmer" />
        </div>

        <section className="mt-14 space-y-3">
          <div className="h-12 w-72 rounded-lg skeleton-shimmer" />
          <div className="h-5 w-48 rounded skeleton-shimmer" />
        </section>

        <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="h-24 rounded-xl skeleton-shimmer" />
          <div className="h-24 rounded-xl skeleton-shimmer" />
          <div className="h-24 rounded-xl skeleton-shimmer" />
          <div className="h-24 rounded-xl skeleton-shimmer" />
        </section>

        <section className="mt-8 h-80 rounded-3xl border border-stroke-default bg-bg-surface/90 p-4 shadow-[0_20px_70px_-40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <div className="h-full rounded-2xl skeleton-shimmer" />
        </section>
      </div>
    </main>
  );
}
