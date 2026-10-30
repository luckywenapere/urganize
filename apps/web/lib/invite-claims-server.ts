// SERVER ONLY — the one implementation of "this invite token joins this user
// to a workspace".
//
// Two consumers, and keeping them on one implementation is the point:
//
//   1. POST /api/invites/[token] — the accept page's click. It used to own
//      this logic inline (joinWorkspaceViaLink + the legacy member-row
//      branch); it now maps this module's results onto its response shapes.
//   2. claimPendingWorkspaceInvite — the DEFERRED claim, run from
//      loadWorkspaceAccessContext on every workspace-aware request. This is
//      the recovery path for the failure a design partner's teammate actually
//      hit: the accept page creates the ACCOUNT first and joins the workspace
//      SECOND, so any failure between the two (a dropped request on weak
//      mobile data, a lost OAuth resume marker, a no-session signup while
//      email confirmation is on) left an account with no membership and
//      nothing that would ever retry the join. The founder then can't assign
//      them tasks and they can't see the team's releases — one root cause,
//      both symptoms. The accept page now stashes the token in
//      auth.user_metadata at signup; this claim finishes the join on the
//      user's FIRST authenticated request, whatever path brought them back
//      into the app.
//
// This module is deliberately LEAF-ONLY (the lib/seats-server.ts rule): it is
// imported by lib/tasks-server.ts AND by the invites route, which hand-rolls
// its auth to stay off the paywalled @/app/api/_shared/auth chain — an
// invitee joining a paid team has no subscription of their own. Import
// nothing here that is not itself a leaf.

import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  isInviteLinkToken,
  looksLikeInviteLinkCode,
  verifyInviteLinkToken,
} from './invite-link';
import { checkSeatAllowance, recordLimitHit } from './seats-server';
import { finishBriefGuestJoin } from './release-brief-guests-server';

const WORKSPACE_MEMBERS_TABLE = 'workspace_members';
const INVITE_LINKS_TABLE = 'workspace_invite_links';
const PROFILES_TABLE = 'profiles';

/** auth.user_metadata key carrying a not-yet-claimed invite token. Written by
 * the accept page's signup, read (and cleared) by the deferred claim. */
export const PENDING_INVITE_METADATA_KEY = 'pending_invite_token';

// Longest real token kind is the stateless wl.* HMAC token (~200 chars);
// anything past this is not one of ours and gets dropped rather than queried.
const MAX_PENDING_TOKEN_LENGTH = 512;

export type InviteClaimResult =
  | { outcome: 'joined'; workspaceId: string }
  | { outcome: 'already_member'; workspaceId: string }
  | {
      outcome: 'rejected';
      reason: 'invalid' | 'expired' | 'already_used' | 'seat_limit';
      message: string;
    }
  // Transient (a query failed): the caller may retry later. The deferred
  // claim keeps the metadata in place so the next request tries again.
  | { outcome: 'error' };

const normalizeEmail = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

/** Pure reader for the pending-invite metadata key. Tolerates every shape a
 * hostile or historical user_metadata could hold — only a plausible token
 * string comes back. Exported for tests. */
export function readPendingInviteToken(user: Pick<User, 'user_metadata'>): string | null {
  const metadata = user.user_metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>)[PENDING_INVITE_METADATA_KEY];
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  if (!token || token.length > MAX_PENDING_TOKEN_LENGTH) return null;
  return token;
}

type LegacyInviteRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  status: string;
  invite_expires_at: string | null;
  joined_at: string | null;
};

export type LegacyInviteClaimDecision =
  | { action: 'already_member' }
  | { action: 'reject'; reason: 'already_used' | 'expired' }
  | { action: 'claim' };

/** Pure decision for a legacy per-email member-row token. Order matters and
 * mirrors the route's long-standing behavior: an already-accepted row answers
 * before expiry is even considered (an invite you already used is "used",
 * not "expired"). Exported for tests. */
export function resolveLegacyInviteClaim(
  row: LegacyInviteRow,
  userId: string,
  nowMs: number = Date.now()
): LegacyInviteClaimDecision {
  if (row.status === 'active' || row.user_id) {
    // Idempotent for the user who already holds it; terminal for anyone else.
    if (row.user_id === userId) return { action: 'already_member' };
    return { action: 'reject', reason: 'already_used' };
  }

  if (row.invite_expires_at) {
    const ms = Date.parse(row.invite_expires_at);
    if (Number.isFinite(ms) && ms <= nowMs) {
      return { action: 'reject', reason: 'expired' };
    }
  }

  return { action: 'claim' };
}

// Invitees join an EXISTING workspace — the first-time onboarding wizard is
// wrong for them and, being a non-dismissible full-screen takeover, traps
// them after acceptance. Best-effort: a failure must never block the join.
async function markInviteeOnboardingComplete(
  admin: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    const result = await admin
      .from(PROFILES_TABLE)
      .update({
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('onboarding_completed', false);
    if (result.error) {
      console.error('[invite-claims] onboarding-complete update error:', result.error.message);
    }
  } catch (error) {
    console.error('[invite-claims] onboarding-complete update threw:', error);
  }
}

type LinkRow = {
  id: string;
  workspace_id: string;
  role: string;
  artist_scope_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

/** Look up a short /join/<code> link row. Null when the code doesn't match a
 * row OR the table isn't migrated yet (tolerant read). */
async function loadLinkByCode(admin: SupabaseClient, code: string): Promise<LinkRow | null> {
  try {
    const result = await admin
      .from(INVITE_LINKS_TABLE)
      .select('id,workspace_id,role,artist_scope_id,expires_at,revoked_at')
      .eq('code', code)
      .maybeSingle();
    if (result.error) return null;
    return (result.data as LinkRow | null) || null;
  } catch {
    return null;
  }
}

function isExpiredAt(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now();
}

const EXPIRED_MESSAGE = 'This invite link has expired. Ask the team owner for a new one.';
const INVALID_MESSAGE = 'Invite not found.';

/** Multi-use JOIN for link-style invites (wl.* tokens and short codes):
 * idempotent for existing members; a colliding pending email-invite row is
 * activated instead of failing. Extracted verbatim from the route's
 * joinWorkspaceViaLink, minus the NextResponse wrapping. */
async function joinWorkspaceAsMember(
  admin: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    email: string;
    role: string;
    artistScopeId: string | null;
  }
): Promise<InviteClaimResult> {
  const { workspaceId, userId, email, role, artistScopeId } = params;

  const existingMembership = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,status')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMembership.data?.id) {
    await markInviteeOnboardingComplete(admin, userId);
    return { outcome: 'already_member', workspaceId };
  }

  // Seat cap. This is the enforcement point that matters most: one shareable
  // link can be redeemed by many people, so capping only the per-email invite
  // route would leave the ceiling trivially bypassable. Placed after the
  // already-a-member return above, because an existing member occupies a seat
  // already and re-entering changes no total.
  //
  // Note the tier is resolved from the WORKSPACE, not from the acting user:
  // the person here is the invitee, and their own primary team is not the
  // team they are joining. Fails open on an unreadable count or tier —
  // refusing a teammate over a transient read failure is the worse mistake.
  const seats = await checkSeatAllowance(admin, workspaceId);
  if (!seats.allowed) {
    await recordLimitHit(admin, {
      workspaceId,
      actorUserId: userId,
      key: seats.key,
      limit: seats.limit,
      current: seats.current,
    });
    // The accept page renders this string verbatim in its inline banner. It
    // names the plan rather than blaming the invitee, and points at the
    // person who can fix it.
    return {
      outcome: 'rejected',
      reason: 'seat_limit',
      message: `${seats.message} Ask the person who invited you to upgrade, then open this link again.`,
    };
  }

  const nowIso = new Date().toISOString();
  const insertPayload: Record<string, unknown> = {
    workspace_id: workspaceId,
    user_id: userId,
    email,
    role,
    status: 'active',
    invite_token: null,
    invite_expires_at: null,
    invited_at: nowIso,
    joined_at: nowIso,
    updated_at: nowIso,
  };
  // Artist links scope the joiner to that artist's releases. Only written
  // when set so unscoped links work before the artist_scope_id migration.
  if (artistScopeId) {
    insertPayload.artist_scope_id = artistScopeId;
  }
  const insertResult = await admin.from(WORKSPACE_MEMBERS_TABLE).insert(insertPayload);

  if (insertResult.error) {
    // A pending email-invite row for the same address would collide on the
    // (workspace_id, email) unique — activate that row instead.
    if (email) {
      const pendingResult = await admin
        .from(WORKSPACE_MEMBERS_TABLE)
        .update({
          user_id: userId,
          status: 'active',
          joined_at: nowIso,
          invite_token: null,
          invite_expires_at: null,
          updated_at: nowIso,
        })
        .eq('workspace_id', workspaceId)
        .eq('email', email)
        .is('user_id', null);
      if (!pendingResult.error) {
        await markInviteeOnboardingComplete(admin, userId);
        return { outcome: 'joined', workspaceId };
      }
    }
    console.error('[invite-claims] link join insert error:', insertResult.error.message);
    return { outcome: 'error' };
  }

  await markInviteeOnboardingComplete(admin, userId);
  return { outcome: 'joined', workspaceId };
}

/** Claim ANY invite-token kind for a signed-in user. Handles all three kinds
 * the accept page handles: stateless wl.* link tokens, short /join/<code>
 * links, and legacy per-email member-row tokens. */
export async function claimWorkspaceInvite(
  admin: SupabaseClient,
  params: { token: string; userId: string; email: string }
): Promise<InviteClaimResult> {
  const token = String(params.token || '').trim();
  const userId = params.userId;
  const email = normalizeEmail(params.email);
  if (!token) return { outcome: 'rejected', reason: 'invalid', message: INVALID_MESSAGE };

  // Stateless wl.* link tokens — verified by signature, not a DB row.
  if (isInviteLinkToken(token)) {
    const verdict = verifyInviteLinkToken(token);
    if (verdict.status === 'invalid') {
      return { outcome: 'rejected', reason: 'invalid', message: INVALID_MESSAGE };
    }
    if (verdict.status === 'expired') {
      return { outcome: 'rejected', reason: 'expired', message: EXPIRED_MESSAGE };
    }
    return joinWorkspaceAsMember(admin, {
      workspaceId: verdict.workspaceId,
      userId,
      email,
      role: verdict.role,
      artistScopeId: verdict.artistScopeId,
    });
  }

  // Short /join/<code> links — same multi-use join semantics.
  if (looksLikeInviteLinkCode(token)) {
    const link = await loadLinkByCode(admin, token);
    if (link) {
      if (link.revoked_at || isExpiredAt(link.expires_at)) {
        return { outcome: 'rejected', reason: 'expired', message: EXPIRED_MESSAGE };
      }
      return joinWorkspaceAsMember(admin, {
        workspaceId: link.workspace_id,
        userId,
        email,
        role: link.role || 'member',
        artistScopeId: link.artist_scope_id || null,
      });
    }
    // No matching link row — fall through to the legacy member-row lookup.
  }

  // Legacy per-email member-row tokens (single-use, row-backed). No seat
  // check here on purpose: an 'invited' row already occupies a seat (counted
  // at mint time in the members/invite route), so accepting adds no seat.
  const inviteResult = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,workspace_id,user_id,email,role,status,invite_token,invite_expires_at,joined_at')
    .eq('invite_token', token)
    .maybeSingle();

  if (inviteResult.error) {
    console.error('[invite-claims] legacy lookup error:', inviteResult.error.message);
    return { outcome: 'error' };
  }
  const invite = (inviteResult.data as LegacyInviteRow | null) || null;
  if (!invite) {
    return { outcome: 'rejected', reason: 'invalid', message: INVALID_MESSAGE };
  }

  const decision = resolveLegacyInviteClaim(invite, userId);
  if (decision.action === 'already_member') {
    await markInviteeOnboardingComplete(admin, userId);
    return { outcome: 'already_member', workspaceId: invite.workspace_id };
  }
  if (decision.action === 'reject') {
    return decision.reason === 'expired'
      ? { outcome: 'rejected', reason: 'expired', message: EXPIRED_MESSAGE }
      : {
          outcome: 'rejected',
          reason: 'already_used',
          message: 'This invite has already been used.',
        };
  }

  // Guard the (workspace_id, user_id) partial unique index — if the user is
  // already a member of this workspace via another row, the UPDATE would
  // fail. Consume the token anyway so the link stays single-use.
  const existingMembership = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,status')
    .eq('workspace_id', invite.workspace_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMembership.data?.id) {
    await admin
      .from(WORKSPACE_MEMBERS_TABLE)
      .update({
        invite_token: null,
        invite_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invite.id);
    await markInviteeOnboardingComplete(admin, userId);
    return { outcome: 'already_member', workspaceId: invite.workspace_id };
  }

  const nowIso = new Date().toISOString();
  const updateResult = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .update({
      user_id: userId,
      status: 'active',
      joined_at: invite.joined_at || nowIso,
      // Clear the token so it can't be reused — single-use by construction.
      invite_token: null,
      invite_expires_at: null,
      updated_at: nowIso,
    })
    .eq('id', invite.id);

  if (updateResult.error) {
    console.error('[invite-claims] legacy accept update error:', updateResult.error.message);
    return { outcome: 'error' };
  }

  // A guest the brief was shared with (#897 phase 6): their part is assigned
  // to them now, and a placeholder email becomes theirs. Does nothing otherwise.
  await finishBriefGuestJoin(admin, { memberId: invite.id, userId, email });

  await markInviteeOnboardingComplete(admin, userId);
  return { outcome: 'joined', workspaceId: invite.workspace_id };
}

/**
 * The deferred claim. Reads the pending-invite token the accept page stashed
 * in auth.user_metadata at signup and finishes the join. Returns whether a
 * membership may have changed, so loadWorkspaceAccessContext knows to
 * re-resolve — the exact contract activatePendingWorkspaceInvitesForUser
 * already has for per-email invites.
 *
 * Steady state (no metadata key) is ZERO queries — this rides the hot path
 * of every workspace-aware request, so it must cost nothing when there is
 * nothing to do.
 *
 * The metadata is cleared on every TERMINAL outcome (joined, already a
 * member, invalid, expired, used, seat-refused) so the claim never re-runs;
 * only a transient error keeps it, and the next request retries. A
 * seat-refused deferred claim has no surface to show its message on — the
 * limit hit is still recorded, so the founder sees the seat count in
 * Settings, and reopening the link shows the invitee the message itself.
 */
export async function claimPendingWorkspaceInvite(
  admin: SupabaseClient,
  user: Pick<User, 'id' | 'email' | 'user_metadata'>
): Promise<boolean> {
  const token = readPendingInviteToken(user);
  if (!token) return false;

  let result: InviteClaimResult;
  try {
    result = await claimWorkspaceInvite(admin, {
      token,
      userId: user.id,
      email: normalizeEmail(user.email),
    });
  } catch (error) {
    console.error('[invite-claims] deferred claim threw:', error);
    return false;
  }

  if (result.outcome !== 'error') {
    try {
      // GoTrue admin updates shallow-merge user_metadata; a null value
      // removes just this key. Best-effort — a failure here only means the
      // (now idempotent) claim runs again on the next request.
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { [PENDING_INVITE_METADATA_KEY]: null },
      });
    } catch (error) {
      console.error('[invite-claims] metadata clear threw:', error);
    }
  }

  return result.outcome === 'joined' || result.outcome === 'already_member';
}
