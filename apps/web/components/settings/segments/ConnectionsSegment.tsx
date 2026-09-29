'use client';

import { McpConnectionsSection } from '@/components/mcp/McpConnectionsSection';
import { DataExportSection } from '../DataExportSection';

/**
 * What can reach your account from outside, and how to take your data out. The
 * two sit together because they are the same question — who and what has your
 * information — and the pop-up hides the whole segment when both are off.
 */
export function ConnectionsSegment() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <McpConnectionsSection />
      <DataExportSection />
    </div>
  );
}
