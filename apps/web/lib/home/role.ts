import type { HomeRole } from './types';

/**
 * Which role's layout the viewer sees, checked in this exact order (the
 * approved plan's section 2 table).
 *
 * WHY `ownerPlan` IS THE RAW SUBSCRIPTIONS.PLAN VALUE, NEVER A RESOLVED
 * ENTITLEMENT TIER. `resolveTeamTier` (lib/entitlements.ts) collapses every
 * trial, comped, founding, walled, legacy and unrecognised plan to `'label'`
 * on purpose — that is the uncapped uncertainty fallback the entitlement
 * system fails open to. Reading that resolved tier here would mis-role every
 * trialing team as Label, which is exactly the mistake the approved plan
 * flagged and ruled out. `teamState === 'paid'` (TeamAccessState, from
 * getTeamAccessForUser) plus the literal `ownerPlan === 'label'` is the only
 * combination that means "this team is genuinely, currently paying for
 * Label" — not "we could not tell, so do not cap them."
 */
export type HomeRoleInput = {
  /** Is the viewer owner or admin of their primary team? */
  isOwnerOrAdmin: boolean;
  /** TeamAccessState ('paid' | 'comped' | 'trial' | 'grace' | 'read_only' |
   * 'walled', from getTeamAccessForUser) of the PRIMARY team. */
  teamState: string;
  /** The primary team owner's raw subscriptions.plan string, or null when
   * there is none to read (no subscription row, or the read failed). */
  ownerPlan: string | null;
  /** profiles.role for the viewer, or null when it could not be read. */
  profileRole: string | null;
  /** True when the viewer's membership in the PRIMARY workspace carries an
   * artist_scope_id (WorkspaceAccessContext.artistScopeByWorkspaceId). */
  isArtistScopedOnPrimary: boolean;
};

export function resolveHomeRole(input: HomeRoleInput): HomeRole {
  // Group ('enterprise', back 2026-10-02) is a roster of labels, so it gets the
  // Label layout too. Still a literal read of the raw plan, for the reason above.
  const isGenuinelyPayingLabel =
    input.teamState === 'paid' && (input.ownerPlan === 'label' || input.ownerPlan === 'enterprise');

  // Row 1: owner/admin of a team that is genuinely, currently paying for
  // Label. Checked FIRST, ahead of row 2's profiles.role check — someone
  // running a paying Label-tier team gets the Label layout regardless of
  // which onboarding option they personally picked (an owner can carry
  // role='artist' from onboarding and still run a Label-tier roster).
  if (input.isOwnerOrAdmin && isGenuinelyPayingLabel) {
    return 'label';
  }

  // Row 2: the viewer identifies as (or is scoped to) one artist, and row 1
  // did not already claim them. Checked BEFORE row 3 on purpose — a solo
  // artist who signed up as "I'm the artist" owns their one-person
  // workspace and would otherwise be caught by the owner/admin check below
  // and shown the Manager layout, which is exactly the "an artist on Solo"
  // case the approved plan calls out.
  if (input.profileRole === 'artist' || input.isArtistScopedOnPrimary) {
    return 'artist';
  }

  // Row 3: owner or admin of their primary team, on any other plan/state
  // (Manager, Solo, trial, comped, an older plan id) — none of which get
  // caught by row 1 because they either aren't 'paid' or aren't 'label'.
  if (input.isOwnerOrAdmin) {
    return 'manager';
  }

  // Row 4: a member or guest on someone else's team, with no artist role or
  // scope of their own — "your part of someone else's release" view.
  return 'artist';
}
