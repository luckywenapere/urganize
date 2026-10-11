'use client';

import { memo } from 'react';
import { DirectoryProfileSection } from '../DirectoryProfileSection';

/**
 * How other teams can find you: opt-in, who can see it, what you do, and the
 * work requests that come back. It belongs to the person and follows them if
 * they leave the team, which is why it is not part of the team's own segments.
 */
function DirectorySegmentView() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <DirectoryProfileSection />
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
export const DirectorySegment = memo(DirectorySegmentView);
