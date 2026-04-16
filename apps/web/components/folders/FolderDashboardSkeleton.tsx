import { SectionCard } from '@/components/shared/SectionCard';

export function FolderDashboardSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-4 sm:px-8 sm:pt-6">
        <div className="rounded-[32px] border border-stroke-default bg-bg-surface/95 p-5 shadow-[0_22px_56px_-32px_rgba(0,0,0,0.46)] sm:p-8">
          <div className="h-3 w-28 rounded-full skeleton-shimmer" />
          <div className="mt-4 h-12 w-full max-w-[40rem] rounded-[20px] skeleton-shimmer" />
          <div className="mt-4 h-4 w-full max-w-[48rem] rounded-full skeleton-shimmer" />
          <div className="mt-6 flex flex-wrap gap-2">
            <div className="h-11 w-24 rounded-full skeleton-shimmer" />
            <div className="h-11 w-28 rounded-full skeleton-shimmer" />
            <div className="h-11 w-36 rounded-full skeleton-shimmer" />
          </div>
        </div>

        <SectionCard className="mt-5 rounded-[32px] p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="h-8 w-40 rounded-full skeleton-shimmer" />
              <div className="mt-2 h-4 w-72 rounded-full skeleton-shimmer" />
            </div>
            <div className="h-12 w-40 rounded-full skeleton-shimmer" />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`folder-skeleton-${index}`}
                className="rounded-[30px] border border-stroke-default bg-bg-elevated/80 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="h-14 w-14 rounded-[18px] skeleton-shimmer" />
                  <div className="h-9 w-9 rounded-full skeleton-shimmer" />
                </div>
                <div className="mt-5 h-7 w-40 rounded-full skeleton-shimmer" />
                <div className="mt-3 h-4 w-28 rounded-full skeleton-shimmer" />
                <div className="mt-6 flex gap-2">
                  <div className="h-8 w-24 rounded-full skeleton-shimmer" />
                  <div className="h-8 w-28 rounded-full skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
