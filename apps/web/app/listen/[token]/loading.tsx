export default function ListenLoading() {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1120px] flex-col justify-between px-6 py-8">
        <div className="flex justify-start">
          <div className="h-10 w-40 rounded-full skeleton-shimmer" />
        </div>

        <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-center">
          <div className="aspect-square rounded-[36px] border border-white/10 bg-white/5 skeleton-shimmer" />
          <div className="space-y-4">
            <div className="h-4 w-28 rounded-full skeleton-shimmer" />
            <div className="h-16 w-4/5 rounded-[18px] skeleton-shimmer" />
            <div className="h-5 w-1/2 rounded-full skeleton-shimmer" />
            <div className="h-[220px] rounded-[30px] border border-white/10 bg-white/5 skeleton-shimmer" />
          </div>
        </div>

        <div className="h-4 w-32 rounded-full skeleton-shimmer" />
      </div>
    </main>
  );
}
