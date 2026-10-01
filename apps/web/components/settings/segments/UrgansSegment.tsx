'use client';

import { memo } from 'react';
import { AiConsentSection } from '../AiConsentSection';
import { TeamBriefSection } from '../TeamBriefSection';
import { WhatsappChasingSection } from '../WhatsappChasingSection';
import { isTeamBriefEnabled } from '@/lib/team-brief';

/**
 * What UrgAns knows about the team, and whether it may use AI at all. The team
 * brief is its own segment, rather than a long form at the bottom of another
 * one, so there is room for UrgAns's own preferences without reshuffling. The
 * pop-up hides the segment only when BOTH the brief and the AI switch are off,
 * so each section checks its own switch here: the brief must not render a form
 * for a feature that is off just because the AI row brought the segment up.
 */
function UrgansSegmentView() {
  return (
    <div className="divide-y divide-stroke-subtle">
      <AiConsentSection />
      {isTeamBriefEnabled() ? <TeamBriefSection /> : null}
      <WhatsappChasingSection />
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
