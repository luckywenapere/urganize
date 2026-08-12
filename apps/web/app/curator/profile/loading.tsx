import { CuratorProfileSkeleton } from '@/components/loading/CuratorSkeleton';

export default function CuratorProfileLoading() {
  return (
    <div className="min-h-screen bg-bg-base">
      <div className="h-14 border-b border-stroke-default" />
      <div className="mx-auto w-full max-w-3xl px-4 pb-28 pt-5 sm:pb-10">
        <CuratorProfileSkeleton />
      </div>
    </div>
  );
}
