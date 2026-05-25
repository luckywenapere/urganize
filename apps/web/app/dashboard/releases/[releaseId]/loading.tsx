import { SkeletonBlock } from '@/components/loading/SkeletonBlock';

export default function ReleaseDetailLoading() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 pb-24 pt-10 sm:px-6">
      <SkeletonBlock className="h-3 w-20 rounded-none" />
      <SkeletonBlock className="mt-3 h-8 w-64 rounded-none" />
      <SkeletonBlock className="mt-2 h-4 w-48 rounded-none" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-12 w-full rounded-none" />
        ))}
      </div>
    </div>
  );
}
