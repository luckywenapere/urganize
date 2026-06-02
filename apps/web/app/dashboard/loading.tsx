import { WorkspaceSkeleton } from '@/components/loading/WorkspaceSkeleton';

// Route-segment Suspense fallback for /dashboard. Renders the same
// WorkspaceSkeleton that WorkspaceView's in-component initial-load fallback
// renders, so the route→client handoff is a zero-shape change.
export default function DashboardLoading() {
  return <WorkspaceSkeleton />;
}
