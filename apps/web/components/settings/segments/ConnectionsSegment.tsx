'use client';

import { memo } from 'react';
import { McpConnectionsSection } from '@/components/mcp/McpConnectionsSection';
import { DataExportSection } from '../DataExportSection';

/**
 * What can reach your account from outside, and how to take your data out. The
 * two sit together because they are the same question — who and what has your
 * information — and the pop-up hides the whole segment when both are off.
 */
function ConnectionsSegmentView() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <McpConnectionsSection />
      <DataExportSection />
    </div>
  );
}

/**
 * Memoised (2026-10-11): every segment opened in this visit stays mounted, and
 * the dialog re-renders on each keystroke in its search box and each dirty or
 * URL change, which used to re-render every one of them. Measured as a 304ms
 * INP on the Team segment. With stable props it now re-renders only when its
 * own inputs change.
 */
export const ConnectionsSegment = memo(ConnectionsSegmentView);
