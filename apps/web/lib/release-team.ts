/**
 * Which team a new rollout belongs to (#854, founder decision 29 Oct 2026).
 *
 * The bug: POST /api/releases always made the artist in the caller's OWN team
 * (ensureOwnedWorkspace) and owned the rollout as the caller. Rollouts are
 * seen by owner id (whole-team visibility, 23 Jul), so a Manager who joined
 * someone's team and added a rollout put it in their own empty team: the team
 * owner never saw it, and owning a rollout flipped the Manager's primary team
 * to that empty team (the 23 Jul primary rule in lib/tasks-server.ts).
 *
 * The rule now: a rollout belongs to the team it is made in. That is the team
 * the caller names (onboarding's team picker), else their primary team. In a
 * team they do not own, the rollout and its artist are owned by that team's
 * owner, so everyone in the team sees it. Viewers cannot add one.
 *
 * Pure, so vitest holds it. The route does the reads.
 */

export type ReleaseTeamMembership = {
  workspaceId: string;
  /** workspace_members.role: owner, admin (Manager), member, guest (Viewer). */
  role: string;
};

export type ReleaseTeamDecision =
  /** The caller's own team: the path every rollout took before this fix. */
  | { kind: 'own' }
  /** A team someone else owns: the rollout is owned by that team's owner. */
  | { kind: 'team'; workspaceId: string }
  | { kind: 'refused'; status: 403 | 404; message: string };

export function resolveReleaseTeam(input: {
  userId: string;
  /** The team the caller asked for, or null. */
  requestedWorkspaceId: string | null;
  memberships: ReleaseTeamMembership[];
  primaryWorkspaceId: string | null;
  /** Owner of each team in `memberships`, by workspace id. */
  ownerByWorkspaceId: Record<string, string>;
}): ReleaseTeamDecision {
  const { userId, requestedWorkspaceId, memberships, primaryWorkspaceId, ownerByWorkspaceId } = input;
  const workspaceId = requestedWorkspaceId || primaryWorkspaceId;
  if (!workspaceId) return { kind: 'own' };

  const membership = memberships.find((item) => item.workspaceId === workspaceId);
  if (!membership) {
    // A team named by the caller must be one of theirs. A missing primary
    // (no team resolved yet) falls back to the old path.
    return requestedWorkspaceId ? { kind: 'refused', status: 404, message: 'Team not found.' } : { kind: 'own' };
  }

  const ownerId = ownerByWorkspaceId[workspaceId] || '';
  if (!ownerId || ownerId === userId) return { kind: 'own' };

  if (membership.role === 'guest') {
    // Named outright: say why. As the default, fall back to their own team,
    // which is what a viewer's "New rollout" always did.
    return requestedWorkspaceId
      ? { kind: 'refused', status: 403, message: 'Your role on this team is view-only.' }
      : { kind: 'own' };
  }

  return { kind: 'team', workspaceId };
}
