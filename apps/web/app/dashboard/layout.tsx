import type { ReactNode } from 'react';
import { WorkspaceFrame } from '@/components/app/WorkspaceFrame';

// The workspace chrome mounts here rather than in the root layout, so its code
// ships only with the routes that show it (URG-314 batch 7). See WorkspaceFrame.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <WorkspaceFrame>{children}</WorkspaceFrame>;
}
