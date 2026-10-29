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
 * the caller names (onboarding's team picker), else the team of the artist
 * they picked, else their primary team. In a team they do not own, the
 * rollout and its artist are owned by that team's owner, so everyone in the
 * team sees it.
 *
 * Only a Manager (role owner or admin) can put a rollout in someone else's
 * team. Team members and Viewers keep the old path (their own team) when no
 * team is named, and are refused when they name one. An artist-scoped
 * teammate can only add rollouts for their own artist there. Only ACTIVE
 * memberships count: an invite not yet accepted grants nothing.
 *
 * Pure, so vitest holds it. The route does the reads.
 */

export type ReleaseTeamMembership = {
  workspaceId: string;
  /** workspace_members.role: owner, admin (Manager), member, guest (Viewer). */
  role: string;
  /** workspace_members.status. Absent is read as active (older callers). */
  status?: string;
};

export type ReleaseTeamDecision =
  /** The caller's own team: the path every rollout took before this fix. */
  | { kind: 'own' }
  /** A team someone else owns: the rollout is owned by that team's owner.
   *  `artistId` is set when the caller is scoped to one artist there. */
  | { kind: 'team'; workspaceId: string; artistId?: string }
  | { kind: 'refused'; status: 400 | 403 | 404; message: string };

/** Roles that may add a rollout to a team someone else owns. */
const TEAM_WRITER_ROLES = new Set(['owner', 'admin']);

export const RELEASE_TEAM_MESSAGES = {
  notFound: 'Team not found.',
  viewOnly: 'Your role on this team is view-only.',
  managersOnly: 'Only a Manager can add rollouts to this team.',
  otherTeamArtist: 'That artist is in a different team.',
  scoped: 'You can only add rollouts for your artist on this team.',
} as const;

export function resolveReleaseTeam(input: {
  userId: string;
  /** The team the caller asked for, or null. */
  requestedWorkspaceId: string | null;
  /** The team of the artist the caller picked (artistId), or null. */
  artistWorkspaceId?: string | null;
  /** The artist the caller picked, or null. */
  artistId?: string | null;
  memberships: ReleaseTeamMembership[];
  primaryWorkspaceId: string | null;
  /** Owner of each candidate team, by workspace id. */
  ownerByWorkspaceId: Record<string, string>;
  /** The artist a caller is scoped to, by workspace id (teams they do not own). */
  artistScopeByWorkspaceId?: Record<string, string>;
}): ReleaseTeamDecision {
  const { userId, requestedWorkspaceId, memberships, primaryWorkspaceId, ownerByWorkspaceId } = input;
  const artistWorkspaceId = input.artistWorkspaceId || null;
  const artistId = input.artistId || null;

  if (requestedWorkspaceId && artistWorkspaceId && artistWorkspaceId !== requestedWorkspaceId) {
    return { kind: 'refused', status: 400, message: RELEASE_TEAM_MESSAGES.otherTeamArtist };
  }

  // Named outright (onboarding's picker): refusals are explained. Otherwise
  // the team is inferred, and anything short of a Manager's seat in someone
  // else's team keeps the old path, so nobody's in-app "New rollout" breaks.
  const named = Boolean(requestedWorkspaceId);
  const workspaceId = requestedWorkspaceId || artistWorkspaceId || primaryWorkspaceId;
  if (!workspaceId) return { kind: 'own' };

  const membership = memberships.find(
    (item) => item.workspaceId === workspaceId && (item.status === undefined || item.status === 'active')
  );
  if (!membership) {
    return named ? { kind: 'refused', status: 404, message: RELEASE_TEAM_MESSAGES.notFound } : { kind: 'own' };
  }

  const ownerId = ownerByWorkspaceId[workspaceId] || '';
  if (!ownerId || ownerId === userId) return { kind: 'own' };

  if (!TEAM_WRITER_ROLES.has(membership.role)) {
    if (!named) return { kind: 'own' };
    return {
      kind: 'refused',
      status: 403,
      message: membership.role === 'guest' ? RELEASE_TEAM_MESSAGES.viewOnly : RELEASE_TEAM_MESSAGES.managersOnly,
    };
  }

  const scope = input.artistScopeByWorkspaceId?.[workspaceId] || '';
  if (scope) {
    if (artistId && artistId !== scope) {
      return { kind: 'refused', status: 403, message: RELEASE_TEAM_MESSAGES.scoped };
    }
    return { kind: 'team', workspaceId, artistId: scope };
  }

  return { kind: 'team', workspaceId };
}

/**
 * Who may plan a rollout (the planner and its auto build), #854. The owner,
 * as before, or a Manager (owner or admin, active) of the team the rollout
 * belongs to. Without this, a Manager's rollout made in a team they joined,
 * which is owned by that team's owner, could not be planned by the Manager
 * who made it.
 */
export function canPlanRelease(input: {
  userId: string;
  releaseOwnerId: string;
  /** The caller's membership in the team the release owner owns, or null. */
  membershipInOwnersTeam: { role: string; status?: string } | null;
}): boolean {
  if (!input.releaseOwnerId) return false;
  if (input.releaseOwnerId === input.userId) return true;
  const membership = input.membershipInOwnersTeam;
  if (!membership) return false;
  if (membership.status !== undefined && membership.status !== 'active') return false;
  return TEAM_WRITER_ROLES.has(membership.role);
}
