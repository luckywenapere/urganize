import { SectionCard } from '@/components/shared/SectionCard';

export function FolderDetailSkeleton() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <div className="mx-auto max-w-[1180px] px-4 pb-10 pt-4 sm:px-8 sm:pt-6">
        <SectionCard className="rounded-[32px] p-5 sm:p-7">
          <div className="h-4 w-24 rounded-full skeleton-shimmer" />
          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-[20px] skeleton-shimmer" />
              <div className="space-y-3">
                <div className="h-10 w-56 rounded-[18px] skeleton-shimmer" />
                <div className="h-4 w-72 rounded-full skeleton-shimmer" />
              </div>
            </div>
            <div className="h-12 w-36 rounded-full skeleton-shimmer" />
          </div>
        </SectionCard>

        <SectionCard className="mt-5 rounded-[32px] p-4 sm:p-6">
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={`filter-skeleton-${index}`} className="h-10 w-24 rounded-full skeleton-shimmer" />
            ))}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`item-skeleton-${index}`}
                className="rounded-[28px] border border-stroke-default bg-bg-elevated/80 p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-3">
                    <div className="h-4 w-20 rounded-full skeleton-shimmer" />
                    <div className="h-8 w-52 rounded-[16px] skeleton-shimmer" />
                  </div>
                  <div className="h-10 w-10 rounded-full skeleton-shimmer" />
                </div>
                <div className="mt-4 h-4 w-full rounded-full skeleton-shimmer" />
                <div className="mt-2 h-4 w-3/4 rounded-full skeleton-shimmer" />
                <div className="mt-6 flex gap-2">
                  <div className="h-9 w-24 rounded-full skeleton-shimmer" />
                  <div className="h-9 w-32 rounded-full skeleton-shimmer" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </main>
  );
}
