import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireActiveAccount, requireApprovedAccount } from '@/app/api/_shared/paywall';
import { getMcpConfig, isMcpConnectEnabled, verifyMcpAccessKey } from '@/lib/mcp/config';
import { extractBearerToken } from '@/lib/mcp/oauth';
import { resolveMcpToken } from '@/lib/mcp/tokens-server';
import { requestHasUrgansPass } from '@/lib/urgans-pass-server';

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
  // THE UrgAns PASS (2026-10-02). A walled or read-only team that holds credits
  // may use UrgAns, changes included, and UrgAns's tools act by calling these
  // very routes. The chat route mints a short-lived, user-bound pass for that
  // case (lib/urgans-pass.ts) and its tools attach it; a valid one skips the
  // PAYWALL check for this one request and nothing else. The curator block above
  // and every route's own ownership and team-access rules still apply.
  if (!requestHasUrgansPass(request, auth.user.id)) {
    const block = await requireActiveAccount(auth.user.id, auth.user.email, request.method);
    if (block) return { error: block };
  } else {
    // The pass skips BILLING, never the invite-only gate (2026-10-15).
    const held = await requireApprovedAccount(auth.user.id, auth.user.email);
    if (held) return { error: held };
  }
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

// ── internal server-to-server actor (URG-183; per-user OAuth added 2026-08-25) ─
//
// The MCP endpoint (app/api/mcp/route.ts) reuses Chappi's tool registry, and
// several of those tools deliberately work by calling our own REST routes over
// HTTP so template instantiation, assignee validation, and notifications are
// never reimplemented (see the header of lib/chappi/tools.ts). Those routes
// validate a Supabase JWT — which an MCP client does not have.
//
// TWO CREDENTIALS RESOLVE HERE, and the ORDER matters: the env key is checked
// first because it is a constant-time comparison against a value already in
// memory, so the common per-user path never pays for it and the founder path
// never touches the database.
//
//   1. MCP_ACCESS_KEY → the single account MCP_USER_ID names.
//   2. A per-user OAuth access token → the account on its own token row.
//
// Both share the property this branch has always rested on: THE CREDENTIAL IS
// THE BINDING. There is no acting-user header, by design — a leaked credential
// can only ever act as the one account it resolves to, never as an arbitrary
// one. Adding per-user tokens does not weaken that; it moves the binding from
// an env var into a row, which is what makes revocation possible at all.
//
// Both also pass the paywall gate, so MCP behaves exactly as that user does in
// the UI, and both now pass the CURATOR block. That block was missing here
// until 2026-08-25 and it mattered the moment the actor stopped being one
// hand-picked account: a curator-only account holds no team, and these routes
// run with an RLS-bypassing service-role client, so without it a playlist owner
// with a token would have been handed a team-data session.
//
// Only the proxied routes opt into this via the *OrInternal helpers below.
// Every other route keeps calling the plain helpers and rejects both
// credentials with a normal 401 (GoTrue won't validate either as a token).

async function resolveInternalActor(request: NextRequest) {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl) return null;
  const adminClient = createAdminClient(supabaseUrl);
  if (!adminClient) return null;

  const userId = await resolveInternalActorUserId(adminClient, token);
  if (!userId) return null;

  const { data, error } = await adminClient.auth.admin.getUserById(userId);
  if (error || !data.user?.id) {
    // Either MCP_USER_ID doesn't resolve, or a token outlived its user. Fall
    // through to normal auth, which 401s — better than granting access on a
    // binding we cannot confirm.
    console.error('[mcp] internal actor did not resolve to a user:', error?.message);
    return null;
  }

  return { user: data.user, supabaseUrl, adminClient };
}

/** Which account this bearer is, if either credential recognises it. */
async function resolveInternalActorUserId(
  adminClient: SupabaseClient,
  token: string
): Promise<string | null> {
  const config = getMcpConfig();
  if (config && verifyMcpAccessKey(token)) return config.userId;
  if (!isMcpConnectEnabled()) return null;
  const actor = await resolveMcpToken(adminClient, token);
  return actor?.userId || null;
}

/** requireActiveAuthenticatedUser, plus the internal-actor path. Use ONLY on
 * routes the MCP/Chappi tool layer calls internally. */
export async function requireActiveAuthenticatedUserOrInternal(request: NextRequest) {
  const internal = await resolveInternalActor(request);
  if (internal) {
    const curatorBlock = await blockCuratorAccount(internal.user.id, internal.supabaseUrl);
    if (curatorBlock) return { error: curatorBlock };
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
    const curatorBlock = await blockCuratorAccount(internal.user.id, internal.supabaseUrl);
    if (curatorBlock) return { error: curatorBlock };
    const block = await requireActiveAccount(internal.user.id, internal.user.email, request.method);
    if (block) return { error: block };
    return { user: internal.user, supabaseUrl: internal.supabaseUrl, adminClient: internal.adminClient };
  }
  return requireAuthenticatedAdmin(request);
}
