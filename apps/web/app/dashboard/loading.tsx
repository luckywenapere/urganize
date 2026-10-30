'use client';

import { usePathname } from 'next/navigation';
import { WorkspaceSkeleton } from '@/components/loading/WorkspaceSkeleton';
import { isArtistPageEnabled } from '@/lib/artist-page';

/**
 * Route-segment Suspense fallback for /dashboard.
 *
 * Without this, /dashboard inherited the ROOT `loading.tsx` (a centered brand
 * mark), so a client-side navigation here showed brand mark → WorkspaceSkeleton
 * → content: two unrelated loading UIs in sequence before anything real. This
 * makes the first frame the same workspace-shaped skeleton the page renders
 * itself, so the handoff is invisible.
 *
 * Since Oct 30, 2026 /dashboard without ?release= is the artist list, which
 * draws its own skeleton, so the workspace shape would be a wrong first frame
 * there. It reads only the path (useSearchParams in a fallback fails the
 * static build), so /dashboard draws nothing here either way: a rollout
 * renders its own ONE skeleton too (WorkspaceView).
 */
export default function DashboardLoading() {
  const pathname = usePathname();
  if ((pathname === '/dashboard' || pathname === '/dashboard/artists') && isArtistPageEnabled()) return null;
  return <WorkspaceSkeleton />;
}
