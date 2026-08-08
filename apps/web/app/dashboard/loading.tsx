import { WorkspaceSkeleton } from '@/components/loading/WorkspaceSkeleton';

/**
 * Route-segment Suspense fallback for /dashboard.
 *
 * Without this, /dashboard inherited the ROOT `loading.tsx` (a centered brand
 * mark), so a client-side navigation here showed brand mark → WorkspaceSkeleton
 * → content: two unrelated loading UIs in sequence before anything real. This
 * makes the first frame the same workspace-shaped skeleton the page renders
 * itself, so the handoff is invisible.
 */
export default function DashboardLoading() {
  return <WorkspaceSkeleton />;
}
