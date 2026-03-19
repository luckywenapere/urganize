export default function AuthLoading() {
  return (
    <main className="min-h-screen bg-bg-base p-4 text-content-primary">
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center">
        <div className="skeleton-card w-full p-6 sm:p-8">
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
