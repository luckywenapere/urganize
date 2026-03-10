export default function PaymentCallbackLoading() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-bg-base text-content-primary">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-170px] h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-brand/12 blur-[130px]" />
      </div>
      <div className="relative flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-3xl border border-stroke-default bg-bg-surface/90 p-6 text-center shadow-[0_20px_70px_-40px_rgba(0,0,0,0.58)] backdrop-blur-xl">
          <div className="mx-auto h-10 w-10 rounded-full skeleton-shimmer" />
          <div className="mt-4 h-4 w-40 mx-auto rounded skeleton-shimmer" />
          <div className="mt-2 h-4 w-28 mx-auto rounded skeleton-shimmer" />
        </div>
      </div>
    </main>
  );
}
