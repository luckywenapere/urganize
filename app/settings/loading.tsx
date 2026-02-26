export default function SettingsLoading() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        <div className="h-10 w-40 rounded-lg skeleton-shimmer" />

        <div className="mt-8 space-y-6">
          <div className="skeleton-card p-6">
            <div className="h-6 w-24 rounded skeleton-shimmer" />
            <div className="mt-4 space-y-3">
              <div className="h-10 rounded-lg skeleton-shimmer" />
              <div className="h-10 rounded-lg skeleton-shimmer" />
              <div className="h-10 w-36 rounded-lg skeleton-shimmer" />
            </div>
          </div>
          <div className="skeleton-card p-6">
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
