import { ReleaseDetailSkeleton } from '@/components/loading/ReleaseDetailSkeleton';

// Route-segment Suspense fallback for /dashboard/releases/[releaseId].
// Renders the same ReleaseDetailSkeleton that the page's in-component
// fallback renders, so route→client handoff is a zero-shape change.
export default function ReleaseDetailLoading() {
  return (
    <main className="min-h-screen bg-bg-base text-content-primary">
      <ReleaseDetailSkeleton />
    </main>
  );
}
