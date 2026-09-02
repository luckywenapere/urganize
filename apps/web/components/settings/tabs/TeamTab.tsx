'use client';

import type { WorkspaceMember } from '@/types/auth';
import { TeammatesSection } from '../TeammatesSection';
import { TeamLoginsSection } from '@/components/team/TeamLoginsSection';

type TeamTabProps = {
  teammates: WorkspaceMember[];
  isLoadingTeammates: boolean;
  onTeammatesChange: (next: WorkspaceMember[]) => void;
  onRefetch: () => void;
  /** Seat ceiling, or null when the team has none. */
  seatLimit?: number | null;
  /** The team's roster, so an artist invite can be scoped to an artist who has
   *  no releases yet — which is every artist you have just added. */
  artists?: { id: string; name: string }[];
};

/**
 * Who's on this team.
 *
 * One section, deliberately alone: it's the largest thing in Settings (invite
 * form + role picker + an unbounded member table), and on the old flat page it
 * led the column and pushed everything else below the fold as the team grew.
 *
 * Renders for every account — the section itself is read-only for non-managers
 * (founder decision, 2026-07-23); TeammatesSection gates invite/remove
 * internally. It keeps its `id="teammates"` anchor so old `#teammates` links
 * stay valid targets even though the page client now redirects them to
 * `?tab=team`.
 *
 * Team logins (2026-08-16) sits BELOW it, and the order is the point: who is
 * already here, then the keys you hand to whoever isn't. That section is
 * manager-only and flag-gated, so it renders nothing for most accounts and
 * this tab stays exactly as it was.
 */
export function TeamTab({
  teammates,
  isLoadingTeammates,
  onTeammatesChange,
  onRefetch,
  seatLimit = null,
  artists,
}: TeamTabProps) {
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
    </div>
  );
}
