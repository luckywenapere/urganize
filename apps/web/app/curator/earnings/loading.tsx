import { CuratorEarningsSkeleton, CuratorDeskPageSkeleton } from '@/components/loading/CuratorSkeleton';

export default function CuratorEarningsLoading() {
  return (
    <>
      {/* Phones: the single column. lg and up: the desktop frame (#1237). */}
      <div className="min-h-screen lg:hidden">
        <div className="h-14 border-b border-stroke-default" />
        <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:pb-10">
          <CuratorEarningsSkeleton />
        </div>
      </div>
      <div className="hidden lg:block">
        <CuratorDeskPageSkeleton body="earnings" />
      </div>
    </>
  );
}
