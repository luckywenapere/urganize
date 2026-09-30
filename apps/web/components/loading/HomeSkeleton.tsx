function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-bg-elevated ${className}`} />;
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-stroke-default bg-bg-surface p-4 sm:p-5">
      <SkeletonBlock className="mb-4 h-5 w-32" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonBlock key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}

/** Home's own loading shape — a Home-shaped skeleton straight to content, so
 * the catalog's skeleton never shows while Home is loading (approved plan,
 * step 2 point 5). Used by both app/dashboard/home/loading.tsx and
 * HomePageClient's own guard while useHomeStore is still loading. */
export function HomeSkeleton() {
  return (
    <div className="home-scene-container space-y-5">
      <div className="flex items-baseline justify-between">
        <div>
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="mt-2 h-8 w-64" />
        </div>
        <SkeletonBlock className="h-4 w-24" />
      </div>
      <div className="flex gap-2">
        <SkeletonBlock className="h-8 w-24 rounded-full" />
        <SkeletonBlock className="h-8 w-20 rounded-full" />
        <SkeletonBlock className="h-8 w-28 rounded-full" />
      </div>
      <div className="home-two-col">
        <div className="space-y-5">
          <SectionSkeleton rows={3} />
          <SectionSkeleton rows={2} />
        </div>
        <div className="space-y-5">
          <SectionSkeleton rows={2} />
          <SectionSkeleton rows={2} />
          <SectionSkeleton rows={1} />
        </div>
      </div>
    </div>
  );
}
