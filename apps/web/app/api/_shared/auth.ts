import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireActiveAccount } from '@/app/api/_shared/paywall';
import { getMcpConfig, verifyMcpAccessKey } from '@/lib/mcp/config';

// Single source of truth for API route auth. This replaces the per-domain
// copies that used to live in releases/_shared.ts, tasks-server.ts,
// ui-drafts/_shared.ts, pricing-validation/_shared.ts, and inline in the
// organization routes. Domain _shared.ts files re-export from here so
// route-level import sites stay stable.

// Validates the Authorization: Bearer <token> header against the Supabase
// anon client. Returns { user, supabaseUrl } or { error } with a ready
// NextResponse (500 on missing env, 401 on missing/invalid token).
//
// Return type is intentionally inferred: callers check both `'error' in auth`
// and `auth.error`, and the second style needs the implicit
// `error?: undefined` member that inference adds to the success branch.
export async function getAuthenticatedUser(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 }) };
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey);
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser(token);
  if (userError || !user?.id) {
    return { error: NextResponse.json({ error: `Unauthorized: ${userError?.message || 'Invalid or expired token'}` }, { status: 401 }) };
  }

  return { user, supabaseUrl };
}

// Auth + global access gate in a single call. Use this on protected routes.
// Returns { error } either when auth fails (401) or when the user has no
// active paid/trial access (402 + redirect: '/locked'). Open routes (auth,
// trial/start, payments/verify, webhooks, subscription-status, admin/*,
// account/delete-now, user/onboarding, pricing-validation) keep using
// getAuthenticatedUser directly — they must work when the user is locked.
//
// `request.method` is forwarded to the gate for READ-ONLY MODE only: a team that
// paid and then lapsed keeps its reads and has its writes refused with a 403.
// Every gated route inherits that from this one line, which is why it is here
// and not in each handler. See the read-only branch in _shared/paywall.ts.
export async function requireActiveAuthenticatedUser(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth;
  const curatorBlock = await blockCuratorAccount(auth.user.id, auth.supabaseUrl);
  if (curatorBlock) return { error: curatorBlock };
  const block = await requireActiveAccount(auth.user.id, auth.user.email, request.method);
  if (block) return { error: block };
  return auth;
}

/**
 * Team-route containment for curator-ONLY accounts (the playlist-pitching user
 * type). Such an account belongs to no team and must never read releases, tasks,
 * files or team data, so the boundary lives HERE — in the one gate every
 * protected team route already passes through — rather than as a check each
 * route has to remember. Curator routes use requireCuratorUser
 * (app/api/curator/_shared.ts) and never reach this.
 *
 * The test is role='curator', and that is deliberately NOT the same question as
 * "is this a playlist owner". Owning playlists is a capability (a
 * curator_profiles row) and can coexist with running releases; role='curator'
 * means only that the team side was never switched on
 * (POST /api/curator/activate-team clears it). So a DUAL account passes straight
 * through here and uses the team product normally, paywall included — its team
 * half is not free. Do not switch this to a curator_profiles lookup; that would
 * lock every dual account out of its own workspace.
 *
 * Row-level security already stops a curator reading those tables directly, but
 * these routes run with the service-role client, which bypasses RLS. This is
 * the check that makes that safe.
 *
 * Costs one primary-key read on profiles per protected request. Fails OPEN for
 * the curator test specifically: an unreadable profile is treated as a normal
 * account, exactly as it was before this existed. Access itself is still gated
 * by requireActiveAccount below.
 */
/**
 * Exported since 2026-08-25 so the OAuth consent grant can apply the same
 * containment. That route deliberately uses the split calls rather than
 * requireActiveAuthenticatedUser (it needs a read-grade paywall check, see its
 * own header), and losing the curator block on the way would be exactly the
 * gap the *OrInternal helpers below used to carry.
 */
export async function blockCuratorAccount(
  userId: string,
  supabaseUrl: string
): Promise<NextResponse | null> {
  const adminClient = createAdminClient(supabaseUrl);
  if (!adminClient) return null;
  try {
    const { data, error } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (error) return null;
    if (String(data?.role || '') !== 'curator') return null;
  } catch {
    return null;
  }
  return NextResponse.json(
    { error: 'This account is for playlist owners.', redirect: '/curator' },
    { status: 403 }
  );
}

// Service-role client for privileged server operations. Only use when
// bypassing RLS is required AND the request is already authorized.
export function createAdminClient(supabaseUrl: string): SupabaseClient | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

// Auth + access gate + admin client in a single call, for handlers where the
// two checks are adjacent (the common case). Handlers that interleave code
// between the auth gate and the admin client (params validation, per-feature
// paywall) keep the split calls so their error precedence — 400 for a bad
// request before 500 for a missing service key — is preserved.
export async function requireAuthenticatedAdmin(request: NextRequest) {
  const auth = await requireActiveAuthenticatedUser(request);
  // The truthiness check (not just `in`) matters: the success branch's
  // inferred `error?: undefined` member would otherwise survive into the
  // return union and callers couldn't narrow to `adminClient`.
  if ('error' in auth && auth.error) return { error: auth.error };
  const adminClient = createAdminClient(auth.supabaseUrl);
  if (!adminClient) {
    return { error: NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 }) };
  }
  return { user: auth.user, supabaseUrl: auth.supabaseUrl, adminClient };
}

// ── internal server-to-server actor (URG-183) ─────────────────────────────
//
// The MCP endpoint (app/api/mcp/route.ts) reuses Chappi's tool registry, and
// four of those tools deliberately work by calling our own REST routes over
// HTTP so template instantiation, assignee validation, and notifications are
// never reimplemented (see the header of lib/chappi/tools.ts). Those routes
// validate a Supabase JWT — which an MCP client, authenticating with a static
// bearer key, does not have.
//
// So: a request whose bearer IS the MCP access key resolves to the single
// account that key is bound to (MCP_USER_ID). No acting-user header exists on
// purpose — the binding is env-side, so a leaked key can only ever act as that
// one user, never as an arbitrary account. The internal actor still passes the
// paywall gate, so MCP behaves exactly as that user does in the UI.
//
// Only the four proxied routes opt into this via the *OrInternal helpers below.
// Every other route keeps calling the plain helpers and rejects the key with a
// normal 401 (GoTrue won't validate it as a token).

async function resolveInternalActor(request: NextRequest) {
  const config = getMcpConfig();
  if (!config) return null;

  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || !verifyMcpAccessKey(token)) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;
  const adminClient = createAdminClient(supabaseUrl);
  if (!adminClient) return null;

  const { data, error } = await adminClient.auth.admin.getUserById(config.userId);
  if (error || !data.user?.id) {
    // Misconfiguration (MCP_USER_ID doesn't resolve). Fall through to normal
    // auth, which 401s — better than granting access on a bad binding.
    console.error('[mcp] MCP_USER_ID did not resolve to a user:', error?.message);
    return null;
  }

  return { user: data.user, supabaseUrl, adminClient };
}

/** requireActiveAuthenticatedUser, plus the internal-actor path. Use ONLY on
 * routes the MCP/Chappi tool layer calls internally. */
export async function requireActiveAuthenticatedUserOrInternal(request: NextRequest) {
  const internal = await resolveInternalActor(request);
  if (internal) {
    const block = await requireActiveAccount(internal.user.id, internal.user.email, request.method);
    if (block) return { error: block };
    return { user: internal.user, supabaseUrl: internal.supabaseUrl };
  }
  return requireActiveAuthenticatedUser(request);
}

/** requireAuthenticatedAdmin, plus the internal-actor path. Use ONLY on routes
 * the MCP/Chappi tool layer calls internally. */
export async function requireAuthenticatedAdminOrInternal(request: NextRequest) {
  const internal = await resolveInternalActor(request);
  if (internal) {
    const block = await requireActiveAccount(internal.user.id, internal.user.email, request.method);
    if (block) return { error: block };
    return { user: internal.user, supabaseUrl: internal.supabaseUrl, adminClient: internal.adminClient };
  }
  return requireAuthenticatedAdmin(request);
}
