export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-[1120px] px-6 py-10 lg:px-10 lg:py-12">
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 rounded-lg skeleton-shimmer" />
          <div className="h-10 w-36 rounded-lg skeleton-shimmer" />
        </div>

        <section className="mt-20">
          <div className="h-12 w-48 rounded-lg skeleton-shimmer" />
          <div className="mt-8 skeleton-card p-7 sm:p-9">
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
