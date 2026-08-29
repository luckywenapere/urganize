// Who may touch a release: the pure decision.
//
// The workspace shows every member the whole shared catalog
// (whole-workspace visibility, founder decision 2026-07-23), and tasks let
// every non-guest member work — but for a year the per-scene route groups
// (metadata, credits, calendar, files, epk, ...) each carried a local
// owner-only check, so a teammate could SEE a release everywhere and then get
// "Release not found." inside any scene. That was a copy-propagation
// accident, not a decision (each clone's docstring justified the copy on
// module-hygiene grounds only). This module is the one rule that replaces
// all of them; lib/release-access-server.ts is the I/O wrapper the route
// groups call.
//
// The decision ORDER is a security property, not a style choice: visibility
// outranks the role gate, so a non-member probing a write endpoint gets
// 'not_found', never a read-only refusal that would confirm the release
// exists. Only someone who can already see the release can learn they are
// read-only in it.
//
// Pure on purpose (no imports, no env, no I/O) so the whole decision table is
// unit-testable — the first-release-prompt / team-brief-nudge split.

/**
 * The 404 body for "not yours / doesn't exist" — shared by every release
 * route group. Two constraints on this exact string:
 * - never a 403 for a non-member: a refusal must not confirm existence;
 * - never 'Not found.': lib/chappi/tool-families/shared.ts's isFlagGateOff
 *   reads that exact body as "the feature flag is off" and would tell the
 *   user the feature is unavailable instead of the release being missing.
 */
export const RELEASE_NOT_FOUND_MESSAGE = 'Release not found.';

export type ReleaseAccessDecision = 'allow' | 'not_found' | 'read_only';

/**
 * Structural slice of tasks-server's WorkspaceAccessContext (a private type
 * there) — the real context is assignable to this without the pure module
 * importing server code.
 */
export type ReleaseAccessContextSlice = {
  /** Owner user ids of every workspace the caller belongs to (always
   * includes the caller). Membership in the owner's workspace IS release
   * visibility. */
  releaseOwnerIds: string[];
  /** Artist-scoped memberships, keyed by OWNER user id: when set, the caller
   * only sees that owner's releases whose artist_id matches. */
  artistScopeByOwnerId: Record<string, string>;
  /** The caller's role in each owner's workspace, keyed by OWNER user id.
   * Missing key = no membership row resolved — treated as read-only for
   * writes, the same fail-closed rule as isReadOnlyWorkspaceMember. */
  memberRoleByOwnerId: Record<string, string>;
};

/**
 * The whole access rule, in evaluation order (each step is a test):
 * 1. The owner is always allowed — reads and writes — without consulting
 *    memberships at all, so a missing or corrupted owner-membership row can
 *    never lock an owner out of their own release.
 * 2. Not a member of the owner's workspace → not_found (whole-workspace
 *    visibility; the refusal must not distinguish "exists but not yours").
 * 3. Artist-scoped member looking at the wrong artist's release → not_found.
 * 4. Writes only: guests (and members whose role could not be resolved) are
 *    read-only. This runs AFTER visibility, so it can only ever be reached
 *    by someone who is allowed to see the release.
 */
export function decideReleaseAccess(input: {
  releaseOwnerId: string;
  releaseArtistId: string;
  userId: string;
  access: ReleaseAccessContextSlice;
  write: boolean;
}): ReleaseAccessDecision {
  const { releaseOwnerId, releaseArtistId, userId, access, write } = input;

  if (releaseOwnerId && releaseOwnerId === userId) {
    return 'allow';
  }

  if (!releaseOwnerId || !access.releaseOwnerIds.includes(releaseOwnerId)) {
    return 'not_found';
  }

  const scope = access.artistScopeByOwnerId[releaseOwnerId];
  if (scope && releaseArtistId !== scope) {
    return 'not_found';
  }

  if (write) {
    const role = access.memberRoleByOwnerId[releaseOwnerId];
    if (!role || role === 'guest') {
      return 'read_only';
    }
  }

  return 'allow';
}
