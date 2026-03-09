export default function RootLoading() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-[980px] items-center justify-center px-6">
        <div className="soft-loading-shell w-full max-w-md rounded-2xl p-6">
          <div className="skeleton-shimmer h-10 w-40 rounded-xl" />
          <div className="mt-4 space-y-3">
            <div className="skeleton-line skeleton-shimmer w-full" />
            <div className="skeleton-line skeleton-shimmer w-4/5" />
          </div>
        </div>
      </div>
    </main>
  );
}
