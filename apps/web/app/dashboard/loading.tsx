'use client';

import { usePathname } from 'next/navigation';
import { ArtistsListSkeleton } from '@/components/loading/ArtistsListSkeleton';
import { WorkspaceSkeleton } from '@/components/loading/WorkspaceSkeleton';
import { isArtistPageEnabled } from '@/lib/artist-page';

/**
 * Route-segment Suspense fallback for /dashboard.
 *
 * Without this, /dashboard inherited the ROOT `loading.tsx` (a centered brand
 * mark), so a client-side navigation here showed brand mark → WorkspaceSkeleton
 * → content: two unrelated loading UIs in sequence before anything real. This
 * makes the first frame the same shape the page renders itself, so the
 * handoff is invisible.
 *
 * Since Oct 30, 2026 /dashboard is Home, the artist list (a rollout is
 * /dashboard?release=). The page reads the query, so on the server it bails
 * out to this fallback, which is Home's first paint. It can read only the path
 * (useSearchParams in a fallback fails the static build), so /dashboard draws
 * the artist list's own skeleton: plain /dashboard, Home and the app's start
 * address, is the common case. A rollout then draws its own skeleton.
 */
export default function DashboardLoading() {
  const pathname = usePathname();
  if ((pathname === '/dashboard' || pathname === '/dashboard/artists') && isArtistPageEnabled()) {
    return (
      <div>
        <div className="pt-5 sm:pt-6" />
        <ArtistsListSkeleton />
      </div>
    );
  }
  return <WorkspaceSkeleton />;
}
