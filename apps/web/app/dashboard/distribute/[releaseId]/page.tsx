import type { Metadata } from 'next';
import { Suspense } from 'react';
import DistributeReleaseClient from './DistributeReleaseClient';

export const metadata: Metadata = {
  title: 'Distribute',
};

export default async function DistributeReleasePage({ params }: { params: Promise<{ releaseId: string }> }) {
  const { releaseId } = await params;
  // Suspense because the client reads the search params (the Fix hand-off).
  return (
    <Suspense fallback={null}>
      <DistributeReleaseClient releaseId={releaseId} />
    </Suspense>
  );
}
