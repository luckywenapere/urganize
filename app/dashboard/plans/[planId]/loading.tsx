export default function PlanLoading() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-[1120px] px-6 py-10 lg:px-10 lg:py-12">
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

        <section className="mt-8 h-80 rounded-2xl skeleton-shimmer" />
      </div>
    </main>
  );
}
