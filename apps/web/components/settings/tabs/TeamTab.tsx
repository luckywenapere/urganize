'use client';

import type { WorkspaceMember } from '@/types/auth';
import { TeammatesSection } from '../TeammatesSection';

type TeamTabProps = {
  teammates: WorkspaceMember[];
  isLoadingTeammates: boolean;
  onTeammatesChange: (next: WorkspaceMember[]) => void;
  onRefetch: () => void;
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
 */
export function TeamTab({
  teammates,
  isLoadingTeammates,
  onTeammatesChange,
  onRefetch,
}: TeamTabProps) {
  return (
    <div className="divide-y divide-stroke-subtle">
      <TeammatesSection
        teammates={teammates}
        isLoadingTeammates={isLoadingTeammates}
        onTeammatesChange={onTeammatesChange}
        onRefetch={onRefetch}
      />
    </div>
  );
}
