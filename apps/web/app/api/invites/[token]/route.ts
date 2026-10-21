import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { claimWorkspaceInvite, type InviteClaimResult } from '@/lib/invite-claims-server';
import { captureActivationIfReached } from '@/lib/activation-server';
import { loadInviteMetadata } from '@/lib/invite-metadata-server';

// Public + authenticated endpoints for token-based invite acceptance.
//
//   GET  /api/invites/[token]   → public; returns invite metadata so the
//                                 /invite/accept page can show "you've been
//                                 invited to <workspace> by <inviter>" before
//                                 the user creates an account. Never leaks
//                                 user_id, never returns the token itself.
//
//   POST /api/invites/[token]   → authenticated; joins the caller via
//                                 lib/invite-claims-server's claimWorkspaceInvite
//                                 (the ONE implementation of the join, shared
//                                 with the deferred claim in
//                                 loadWorkspaceAccessContext — keep them on one
//                                 implementation). Uses the service-role admin
//                                 client because the caller does not own the
//                                 row yet (user_id is NULL until acceptance).
//
// Why not put this behind the paywall? Invites are the entry path INTO a
// paid workspace — the invitee doesn't have a subscription yet, and the
// inviter's paid status is what authorizes access. Both endpoints are
// open routes (paywall-bypassed); the POST still requires a valid
// Supabase session so anonymous callers can't claim invites.


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

// ────────────────────────────────────────────────────────────────────────────
// GET — metadata for the /invite/accept page
// ────────────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await context.params;
  const result = await loadInviteMetadata(rawToken);
  return NextResponse.json(result.body, { status: result.status });
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

  const result = await claimWorkspaceInvite(admin, {
    token,
    userId,
    email: String(userResult.data.user.email || '').trim().toLowerCase(),
  });
  // Activation (2026-10-01): somebody actually joining is a teammate invited.
  // Credited to the workspace owner. Never throws.
  if (result.outcome === 'joined') {
    await captureActivationIfReached(admin, { workspaceId: result.workspaceId, trigger: 'invite' });
  }
  return claimResultToResponse(result);
}

/** Map the shared claim result onto this route's long-standing response
 * shapes. The accept page only checks response.ok and renders `error`
 * verbatim, so the status strings here are informational. */
function claimResultToResponse(result: InviteClaimResult): NextResponse {
  switch (result.outcome) {
    case 'joined':
      return NextResponse.json({ status: 'accepted', workspaceId: result.workspaceId });
    case 'already_member':
      return NextResponse.json({ status: 'already_member', workspaceId: result.workspaceId });
    case 'rejected': {
      const status =
        result.reason === 'invalid' ? 404 : result.reason === 'seat_limit' ? 409 : 410;
      return NextResponse.json({ error: result.message }, { status });
    }
    case 'error':
    default:
      return NextResponse.json({ error: 'Could not accept invite.' }, { status: 500 });
  }
}
