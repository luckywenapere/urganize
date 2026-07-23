import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  isInviteLinkToken,
  looksLikeInviteLinkCode,
  verifyInviteLinkToken,
} from '@/lib/invite-link';

// Public + authenticated endpoints for token-based invite acceptance.
//
//   GET  /api/invites/[token]   → public; returns invite metadata so the
//                                 /invite/accept page can show "you've been
//                                 invited to <workspace> by <inviter>" before
//                                 the user creates an account. Never leaks
//                                 user_id, never returns the token itself.
//
//   POST /api/invites/[token]   → authenticated; links the current user to
//                                 the pending workspace_members row by token.
//                                 Uses the service-role admin client for the
//                                 UPDATE because the user does not own the
//                                 row yet (user_id is NULL until acceptance).
//
// Why not put this behind the paywall? Invites are the entry path INTO a
// paid workspace — the invitee doesn't have a subscription yet, and the
// inviter's paid status is what authorizes access. Both endpoints are
// open routes (paywall-bypassed); the POST still requires a valid
// Supabase session so anonymous callers can't claim invites.

const WORKSPACE_MEMBERS_TABLE = 'workspace_members';
const WORKSPACES_TABLE = 'workspaces';
const PROFILES_TABLE = 'profiles';

type SupabaseConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
};

const readSupabaseConfig = (): SupabaseConfig | null => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return null;
  return { supabaseUrl, serviceRoleKey, anonKey };
};

const createAdmin = (config: SupabaseConfig): SupabaseClient =>
  createClient(config.supabaseUrl, config.serviceRoleKey);

function normalizeToken(raw: unknown): string {
  return String(raw || '').trim();
}

type InviteRow = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email: string;
  role: string;
  status: string;
  invite_token: string | null;
  invite_expires_at: string | null;
  joined_at: string | null;
};

async function loadInvite(admin: SupabaseClient, token: string): Promise<InviteRow | null> {
  const result = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,workspace_id,user_id,email,role,status,invite_token,invite_expires_at,joined_at')
    .eq('invite_token', token)
    .maybeSingle();

  if (result.error) {
    console.error('[invites/token] lookup error:', result.error.message);
    return null;
  }
  return (result.data as InviteRow | null) || null;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return false;
  return ms <= Date.now();
}

// Shared context lookup for both invite kinds: workspace name + the owner's
// display name for the "invited to X by Y" line on the accept page.
async function loadWorkspaceContext(
  admin: SupabaseClient,
  workspaceId: string
): Promise<{ workspaceName: string; inviterName: string | null }> {
  const [workspaceResult, ownerProfileResult] = await Promise.all([
    admin.from(WORKSPACES_TABLE).select('id,owner_id,name').eq('id', workspaceId).maybeSingle(),
    admin
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('role', 'owner')
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const workspaceName = workspaceResult.data?.name || 'a workspace';
  const ownerUserId = ownerProfileResult.data?.user_id || workspaceResult.data?.owner_id || null;

  let inviterName: string | null = null;
  if (ownerUserId) {
    const ownerProfile = await admin
      .from(PROFILES_TABLE)
      .select('name,email,artist_name')
      .eq('id', ownerUserId)
      .maybeSingle();
    inviterName =
      ownerProfile.data?.name || ownerProfile.data?.artist_name || ownerProfile.data?.email || null;
  }

  return { workspaceName, inviterName };
}

type LinkRow = {
  id: string;
  workspace_id: string;
  role: string;
  artist_scope_id: string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

/** Look up a short /join/<code> link row. Null when the code doesn't match
 * a row OR the table isn't migrated yet (tolerant read). */
async function loadLinkByCode(admin: SupabaseClient, code: string): Promise<LinkRow | null> {
  try {
    const result = await admin
      .from('workspace_invite_links')
      .select('id,workspace_id,role,artist_scope_id,expires_at,revoked_at')
      .eq('code', code)
      .maybeSingle();
    if (result.error) return null;
    return (result.data as LinkRow | null) || null;
  } catch {
    return null;
  }
}

/** Shared multi-use JOIN for link-style invites (wl.* tokens and short
 * codes): idempotent for existing members; a colliding pending email-invite
 * row is activated instead of failing. */
async function joinWorkspaceViaLink(
  admin: SupabaseClient,
  params: {
    workspaceId: string;
    userId: string;
    email: string;
    role: string;
    artistScopeId: string | null;
  }
): Promise<NextResponse> {
  const { workspaceId, userId, email, role, artistScopeId } = params;

  const existingMembership = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,status')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMembership.data?.id) {
    return NextResponse.json({ status: 'already_member', workspaceId });
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
        return NextResponse.json({ status: 'accepted', workspaceId });
      }
    }
    console.error('[invites/token] link join insert error:', insertResult.error.message);
    return NextResponse.json({ error: 'Could not accept invite.' }, { status: 500 });
  }

  return NextResponse.json({ status: 'accepted', workspaceId });
}

// ────────────────────────────────────────────────────────────────────────────
// GET — metadata for the /invite/accept page
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const config = readSupabaseConfig();
  if (!config) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const { token: rawToken } = await context.params;
  const token = normalizeToken(rawToken);
  if (!token) {
    return NextResponse.json({ error: 'Missing invite token.' }, { status: 400 });
  }

  const admin = createAdmin(config);

  // Shareable LINK tokens (wl.*) are stateless — verified by signature, not
  // a DB row. Multi-use until expiry; whoever holds one joins as a member.
  if (isInviteLinkToken(token)) {
    const verdict = verifyInviteLinkToken(token);
    if (verdict.status === 'invalid') {
      return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
    }
    if (verdict.status === 'expired') {
      return NextResponse.json({
        status: 'expired',
        workspaceName: 'a workspace',
        inviterName: null,
        invitedEmail: '',
        role: 'member',
      });
    }
    const context = await loadWorkspaceContext(admin, verdict.workspaceId);
    return NextResponse.json({
      status: 'valid',
      workspaceName: context.workspaceName,
      inviterName: context.inviterName,
      invitedEmail: '',
      role: verdict.role,
    });
  }

  // Short /join/<code> links (workspace_invite_links). Checked BEFORE the
  // legacy member-row lookup — codes never collide with UUID tokens (no
  // dashes) and the lookup is tolerant of the table not being migrated.
  if (looksLikeInviteLinkCode(token)) {
    const link = await loadLinkByCode(admin, token);
    if (link) {
      if (link.revoked_at || isExpired(link.expires_at)) {
        return NextResponse.json({
          status: 'expired',
          workspaceName: 'a workspace',
          inviterName: null,
          invitedEmail: '',
          role: link.role || 'member',
        });
      }
      const context = await loadWorkspaceContext(admin, link.workspace_id);
      return NextResponse.json({
        status: 'valid',
        workspaceName: context.workspaceName,
        inviterName: context.inviterName,
        invitedEmail: '',
        role: link.role || 'member',
      });
    }
    // No matching link row — fall through to the legacy member-row lookup.
  }

  const invite = await loadInvite(admin, token);
  if (!invite) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  // Fetch the workspace + inviter so the accept page can show context.
  // The inviter is the workspace owner; we don't have a separate "invited_by"
  // column on workspace_members today, so we infer from owner.
  const { workspaceName, inviterName } = await loadWorkspaceContext(admin, invite.workspace_id);

  const expired = isExpired(invite.invite_expires_at);
  const status: 'valid' | 'expired' | 'accepted' =
    invite.status === 'active' || invite.user_id ? 'accepted' : expired ? 'expired' : 'valid';

  return NextResponse.json({
    status,
    workspaceName,
    inviterName,
    invitedEmail: invite.email,
    role: invite.role,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// POST — accept the invite (authenticated)
// ────────────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const config = readSupabaseConfig();
  if (!config) {
    return NextResponse.json({ error: 'Server environment is not configured.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'Sign in to accept this invite.' }, { status: 401 });
  }

  const anonClient = createClient(config.supabaseUrl, config.anonKey);
  const userResult = await anonClient.auth.getUser(accessToken);
  if (userResult.error || !userResult.data.user?.id) {
    return NextResponse.json({ error: 'Sign in to accept this invite.' }, { status: 401 });
  }
  const userId = userResult.data.user.id;

  const { token: rawToken } = await context.params;
  const token = normalizeToken(rawToken);
  if (!token) {
    return NextResponse.json({ error: 'Missing invite token.' }, { status: 400 });
  }

  const admin = createAdmin(config);

  // Shareable LINK tokens (wl.*): verify the signature, then ADD the caller
  // as an active member (multi-use — the token is not consumed). Idempotent
  // for existing members.
  if (isInviteLinkToken(token)) {
    const verdict = verifyInviteLinkToken(token);
    if (verdict.status === 'invalid') {
      return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
    }
    if (verdict.status === 'expired') {
      return NextResponse.json(
        { error: 'This invite link has expired. Ask the workspace owner for a new one.' },
        { status: 410 }
      );
    }

    return joinWorkspaceViaLink(admin, {
      workspaceId: verdict.workspaceId,
      userId,
      email: String(userResult.data.user.email || '').trim().toLowerCase(),
      role: verdict.role,
      artistScopeId: verdict.artistScopeId,
    });
  }

  // Short /join/<code> links — same multi-use join semantics as wl.* tokens.
  if (looksLikeInviteLinkCode(token)) {
    const link = await loadLinkByCode(admin, token);
    if (link) {
      if (link.revoked_at || isExpired(link.expires_at)) {
        return NextResponse.json(
          { error: 'This invite link has expired. Ask the workspace owner for a new one.' },
          { status: 410 }
        );
      }
      return joinWorkspaceViaLink(admin, {
        workspaceId: link.workspace_id,
        userId,
        email: String(userResult.data.user.email || '').trim().toLowerCase(),
        role: link.role || 'member',
        artistScopeId: link.artist_scope_id || null,
      });
    }
    // No matching link row — fall through to the legacy member-row lookup.
  }

  const invite = await loadInvite(admin, token);
  if (!invite) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  if (invite.status === 'active' || invite.user_id) {
    // Already accepted. If THIS user is the one it was already accepted by,
    // treat as success (idempotent). Otherwise reject.
    if (invite.user_id === userId) {
      return NextResponse.json({
        status: 'already_accepted',
        workspaceId: invite.workspace_id,
      });
    }
    return NextResponse.json(
      { error: 'This invite has already been used.' },
      { status: 410 }
    );
  }

  if (isExpired(invite.invite_expires_at)) {
    return NextResponse.json(
      { error: 'This invite link has expired. Ask the workspace owner for a new one.' },
      { status: 410 }
    );
  }

  // Guard the (workspace_id, user_id) partial unique index — if the user
  // is already a member of this workspace via another row, the UPDATE
  // would fail. In that case nothing to do; report success.
  const existingMembership = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,status')
    .eq('workspace_id', invite.workspace_id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingMembership.data?.id) {
    // Still consume the token so the link is single-use even on the
    // already-member edge case.
    await admin
      .from(WORKSPACE_MEMBERS_TABLE)
      .update({
        invite_token: null,
        invite_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invite.id);

    return NextResponse.json({
      status: 'already_member',
      workspaceId: invite.workspace_id,
    });
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
    console.error('[invites/token] accept update error:', updateResult.error.message);
    return NextResponse.json(
      { error: 'Could not accept invite.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: 'accepted',
    workspaceId: invite.workspace_id,
  });
}
