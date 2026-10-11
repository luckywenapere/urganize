'use client';

import { memo } from 'react';
import type { WorkspaceMember } from '@/types/auth';
import { TeamLoginsSection } from '@/components/team/TeamLoginsSection';
import { TeammatesSection } from '../TeammatesSection';
import { ReferralInviteSection } from '../ReferralInviteSection';

type TeamSegmentProps = {
  teammates: WorkspaceMember[];
  isLoadingTeammates: boolean;
  onTeammatesChange: (next: WorkspaceMember[]) => void;
  onRefetch: () => void;
  /** Seat ceiling, or null when the team has none. */
  seatLimit: number | null;
  /** The team's roster, so an artist invite can be scoped to an artist who has
   *  no rollouts yet — which is every artist you have just added. */
  artists?: { id: string; name: string }[];
};

/**
 * Who is on the team, and the links you hand to whoever is not.
 *
 * The order is the point: the people already here, then the keys for the ones
 * who are not. Only managers get this segment (`visibleSettingsSegments`), so
 * the invite and remove controls TeammatesSection used to hide from everyone
 * else are never reached by anyone who cannot use them.
 */
function TeamSegmentView({
  teammates,
  isLoadingTeammates,
  onTeammatesChange,
  onRefetch,
  seatLimit,
  artists,
}: TeamSegmentProps) {
  return (
    <div className="divide-y divide-stroke-subtle">
      <TeammatesSection
        teammates={teammates}
        isLoadingTeammates={isLoadingTeammates}
        onTeammatesChange={onTeammatesChange}
        onRefetch={onRefetch}
        seatLimit={seatLimit}
        artists={artists}
      />
      <TeamLoginsSection />
      <ReferralInviteSection />
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
export const TeamSegment = memo(TeamSegmentView);
