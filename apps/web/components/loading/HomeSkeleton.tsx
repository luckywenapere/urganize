function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-bg-elevated ${className}`} />;
}

/** Home's own loading shape, in the order the page reads: the date and greeting,
 * the one thing to do (or the up-next card), the "For you today" cards, the ask
 * box (a button on a phone, the full box at lg+) and the "See everything" row.
 * Used by both app/dashboard/home/loading.tsx and HomePageClient's own guard
 * while useHomeStore is still loading. Keep in step with ManagerMidReleaseView. */
export function HomeSkeleton() {
  return (
    <div className="home-scene-container space-y-5" aria-hidden="true">
      <div>
        <SkeletonBlock className="h-3 w-28" />
        <SkeletonBlock className="mt-2 h-8 w-64 sm:h-9" />
      </div>
      <SkeletonBlock className="h-40 w-full rounded-2xl" />
      <div>
        <SkeletonBlock className="mb-3 h-6 w-36" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SkeletonBlock className="h-[4.5rem] rounded-2xl" />
          <SkeletonBlock className="h-[4.5rem] rounded-2xl" />
          <SkeletonBlock className="hidden h-[4.5rem] rounded-2xl sm:block" />
        </div>
      </div>
      <SkeletonBlock className="h-14 w-full rounded-2xl lg:hidden" />
      <SkeletonBlock className="hidden h-[7.5rem] w-full rounded-2xl lg:block" />
      <SkeletonBlock className="h-11 w-full rounded-xl" />
    </div>
  );
}
