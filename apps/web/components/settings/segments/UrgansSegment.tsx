'use client';

import { memo } from 'react';
import { TeamBriefSection } from '../TeamBriefSection';
import { WhatsappChasingSection } from '../WhatsappChasingSection';
import { UrgansActivitySection } from '../UrgansActivitySection';
import { isTeamBriefEnabled } from '@/lib/team-brief';

/**
 * What UrgAns knows about the team. Today that is the team brief; it is its own
 * segment, rather than a long form at the bottom of another one, so there is
 * room for more of UrgAns's own preferences later without reshuffling. The
 * pop-up hides the segment while the brief is switched off.
 */
function UrgansSegmentView() {
  return (
    <div className="divide-y divide-stroke-subtle">
      {isTeamBriefEnabled() ? <TeamBriefSection /> : null}
      <WhatsappChasingSection />
      <UrgansActivitySection />
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
export const UrgansSegment = memo(UrgansSegmentView);
