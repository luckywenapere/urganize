import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

function ReleaseCardSkeleton() {
  return (
    <div className="overflow-hidden border border-stroke-default bg-bg-surface">
      <SkeletonBlock className="aspect-square w-full rounded-none" />
      <div className="space-y-5 p-4 sm:p-5">
        <div>
          <div className="flex items-center justify-between gap-3">
            <SkeletonBlock className="h-3 w-24 rounded-none" />
            <SkeletonBlock className="h-6 w-20 rounded-none" />
          </div>
          <SkeletonBlock className="mt-3 h-6 w-4/5 rounded-none" />
          <SkeletonBlock className="mt-2 h-6 w-2/3 rounded-none" />
        </div>
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-36 rounded-none" />
          <SkeletonBlock className="h-4 w-32 rounded-none" />
        </div>
        <SkeletonBlock className="h-2 w-full rounded-none" />
      </div>
    </div>
  );
}

export default function ReleasesLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6">
      <section className="border border-stroke-default bg-bg-surface p-4 sm:p-5">
        <SkeletonBlock className="h-3 w-36 rounded-none" />
        <SkeletonBlock className="mt-3 h-9 w-48 rounded-none" />
        <SkeletonBlock className="mt-3 h-5 w-full max-w-xl rounded-none" />
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <ReleaseCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
