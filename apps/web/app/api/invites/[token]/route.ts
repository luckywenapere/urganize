import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
  const invite = await loadInvite(admin, token);
  if (!invite) {
    return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
  }

  // Fetch the workspace + inviter so the accept page can show context.
  // The inviter is the workspace owner; we don't have a separate "invited_by"
  // column on workspace_members today, so we infer from owner.
  const [workspaceResult, ownerProfileResult] = await Promise.all([
    admin
      .from(WORKSPACES_TABLE)
      .select('id,owner_id,name')
      .eq('id', invite.workspace_id)
      .maybeSingle(),
    admin
      .from(WORKSPACE_MEMBERS_TABLE)
      .select('user_id')
      .eq('workspace_id', invite.workspace_id)
      .eq('role', 'owner')
      .eq('status', 'active')
      .maybeSingle(),
  ]);

  const workspaceName = workspaceResult.data?.name || 'a workspace';
  const ownerUserId =
    ownerProfileResult.data?.user_id || workspaceResult.data?.owner_id || null;

  let inviterName: string | null = null;
  if (ownerUserId) {
    const ownerProfile = await admin
      .from(PROFILES_TABLE)
      .select('name,email,artist_name')
      .eq('id', ownerUserId)
      .maybeSingle();
    inviterName =
      ownerProfile.data?.name ||
      ownerProfile.data?.artist_name ||
      ownerProfile.data?.email ||
      null;
  }

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
