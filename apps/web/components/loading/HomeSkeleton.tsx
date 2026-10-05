function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-bg-elevated ${className}`} />;
}

/** Home's own loading shape — a Home-shaped skeleton straight to content, so
 * the catalog's skeleton never shows while Home is loading (approved plan,
 * step 2 point 5). Used by both app/dashboard/home/loading.tsx and
 * HomePageClient's own guard while useHomeStore is still loading. */
export function HomeSkeleton() {
  return (
    <div className="home-scene-container space-y-5">
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="mt-2 h-8 w-64" />
          </div>
          <SkeletonBlock className="h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <SkeletonBlock className="h-11 w-28 rounded-full" />
          <SkeletonBlock className="h-11 w-28 rounded-full" />
          <SkeletonBlock className="h-11 w-40 rounded-full" />
        </div>
      </div>
      <SkeletonBlock className="h-36 w-full rounded-2xl" />
      <div>
        <SkeletonBlock className="mb-3 h-5 w-32" />
        <div className="flex gap-3">
          <SkeletonBlock className="h-24 min-w-0 flex-1 rounded-2xl" />
          <SkeletonBlock className="h-24 min-w-0 flex-1 rounded-2xl" />
          <SkeletonBlock className="hidden h-24 min-w-0 flex-1 rounded-2xl sm:block" />
        </div>
      </div>
      <SkeletonBlock className="h-14 w-full rounded-2xl" />
      <SkeletonBlock className="h-11 w-full rounded-xl" />
    </div>
  );
}
