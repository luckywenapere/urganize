export default function PaymentCallbackLoading() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="skeleton-card w-full max-w-sm p-6 text-center">
          <div className="mx-auto h-10 w-10 rounded-full skeleton-shimmer" />
          <div className="mt-4 h-4 w-40 mx-auto rounded skeleton-shimmer" />
          <div className="mt-2 h-4 w-28 mx-auto rounded skeleton-shimmer" />
        </div>
      </div>
    </main>
  );
}
