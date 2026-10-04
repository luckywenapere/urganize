// Matches the page's resting shape: header, a summary line, search and filters,
// then rows. Kept in step with OpportunitiesPageClient.
export default function Loading() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="flex flex-col gap-4 pb-6 pt-8 sm:flex-row sm:items-end sm:justify-between sm:pb-7 sm:pt-10">
        <div>
          <div className="h-10 w-64 rounded-lg bg-bg-elevated" />
          <div className="mt-2 h-4 w-80 max-w-full rounded-lg bg-bg-elevated" />
        </div>
        <div className="h-12 w-44 rounded-full bg-bg-elevated" />
      </div>
      <div className="mb-4 h-5 w-40 rounded-lg bg-bg-elevated" />
      <div className="mb-4 space-y-3">
        <div className="h-11 w-full rounded-lg bg-bg-elevated" />
        <div className="flex gap-2">
          <div className="h-11 w-20 rounded-full bg-bg-elevated" />
          <div className="h-11 w-20 rounded-full bg-bg-elevated" />
          <div className="h-11 w-32 rounded-lg bg-bg-elevated" />
        </div>
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-bg-elevated" />
        ))}
      </div>
    </div>
  );
}
