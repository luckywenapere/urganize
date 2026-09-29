'use client';

import { TeamBriefSection } from '../TeamBriefSection';

/**
 * What UrgAns knows about the team. Today that is the team brief; it is its own
 * segment, rather than a long form at the bottom of another one, so there is
 * room for more of UrgAns's own preferences later without reshuffling. The
 * pop-up hides the segment while the brief is switched off.
 */
export function UrgansSegment() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <TeamBriefSection />
    </div>
  );
}
