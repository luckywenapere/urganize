import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Legacy-invite escape hatch.
//
// Old invite emails point at `/auth?next=/dashboard/tasks&email=foo@bar`
// (the pre-token URL format). After /auth went login-only, those
// recipients would have no native path forward — clicking "Sign up"
// would dump them into /onboarding and create a phantom workspace. This
// endpoint is the bridge: /auth detects the legacy URL signature and
// POSTs the invited email here, the endpoint mints a fresh invite_token
// against the pending workspace_members row, and the client redirects
// the user to /invite/accept?token=… (the same surface new invitees use).
//
// ─── Security model ──────────────────────────────────────────────────
//
// The endpoint is intentionally unauthenticated — the user is anonymous
// at this point. Protections layered to reduce email-enumeration value:
//
//   1. Uniform response shape. ALWAYS returns { token: string } — never
//      a null, never a distinct "invited: true/false" field, never a
//      different HTTP status for the no-invite branch. A scraping
//      attacker can still tell apart "real UUID" vs "empty string" by
//      reading the response body, but the response cannot be filtered
//      structurally; they must parse content for every probe.
//
//   2. Timing floor. Every response is padded to a minimum of 200ms so
//      the mint path (lookup + UPDATE → ~150ms) and the lookup-only
//      path (~50ms) don't leak via response time. Not airtight against
//      a determined timing attack, but raises the cost of casual probes.
//
//   3. Edge rate-limit (REQUIRED — see TODO below). Vercel functions
//      are stateless; we cannot enforce strict per-IP throttling here
//      without external state (Upstash/Redis). Edge rate-limit MUST be
//      configured before this endpoint ships to live traffic.
//
// The underlying trust model is unchanged from the auth.users INSERT
// trigger (20260605010000_invite_linkage_trigger.sql): controlling the
// invited email is already the threshold for joining a workspace.
// Surfacing a token doesn't widen that — it just makes the existing
// trust explicit.
//
// ─── TODO: edge rate-limit before live use ───────────────────────────
//
// Configure in Vercel Project → Settings → Firewall:
//   * Path: /api/invites/resolve-by-email
//   * Method: POST
//   * Limit: 10 requests per IP per minute
//   * Action: deny + 429
//
// Or equivalent at Cloudflare WAF if the project moves off Vercel:
//   rule expression: (http.request.uri.path eq "/api/invites/resolve-by-email"
//                    and http.request.method eq "POST")
//   action: rate-limit 10/min per ip, return 429.
//
// Without one of these in place, a probing script can run lookups at
// network speed, mostly defeated by the 200ms timing floor but not at
// truly large scale (parallel connections across IPs is still cheap).

const WORKSPACE_MEMBERS_TABLE = 'workspace_members';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_RESPONSE_MS = 200;

type SupabaseConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
};

const readSupabaseConfig = (): SupabaseConfig | null => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
};

const createAdmin = (config: SupabaseConfig): SupabaseClient =>
  createClient(config.supabaseUrl, config.serviceRoleKey);

const isValidEmail = (value: string): boolean => /\S+@\S+\.\S+/.test(value);

type ResolveBody = { email?: unknown };

type PendingInviteRow = {
  id: string;
  invite_token: string | null;
  invite_expires_at: string | null;
};

async function padToMinDuration(start: number): Promise<void> {
  const elapsed = Date.now() - start;
  if (elapsed >= MIN_RESPONSE_MS) return;
  await new Promise((resolve) => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
}

async function resolveToken(admin: SupabaseClient, email: string): Promise<string> {
  // Most recent pending invite for this email across all workspaces.
  // Multi-workspace invitees: client gets routed to the latest one and
  // the auth.users INSERT trigger handles the others by email match
  // when the user finishes signup. So returning one is sufficient.
  const inviteResult = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .select('id,invite_token,invite_expires_at')
    .ilike('email', email)
    .eq('status', 'invited')
    .is('user_id', null)
    .order('invited_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteResult.error) {
    // Log + return empty rather than propagating — the client treats
    // empty the same as "no invite" (silent fall-through to login).
    console.error('[invites/resolve-by-email] lookup error:', inviteResult.error.message);
    return '';
  }

  const invite = (inviteResult.data as PendingInviteRow | null) || null;
  if (!invite) {
    return '';
  }

  const existingTokenIsValid =
    invite.invite_token &&
    invite.invite_expires_at &&
    Date.parse(invite.invite_expires_at) > Date.now();

  if (existingTokenIsValid && invite.invite_token) {
    return invite.invite_token;
  }

  // Mint a fresh token. crypto-strength UUID, 30-day expiry — matches
  // the invite endpoint exactly so the token format is uniform across
  // both code paths.
  const token = randomUUID();
  const expiresAtIso = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const updateResult = await admin
    .from(WORKSPACE_MEMBERS_TABLE)
    .update({
      invite_token: token,
      invite_expires_at: expiresAtIso,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invite.id);

  if (updateResult.error) {
    console.error('[invites/resolve-by-email] token mint error:', updateResult.error.message);
    return '';
  }

  return token;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const config = readSupabaseConfig();
  if (!config) {
    // Even the misconfigured-env branch pads timing — no fast-fail on
    // config issues that could be probed independently.
    await padToMinDuration(start);
    return NextResponse.json({ token: '' });
  }

  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    body = {};
  }

  const email = String(body.email || '').trim().toLowerCase();
  // Same empty response for invalid email, missing email, and no
  // pending invite — all three are indistinguishable in the body. The
  // 400-shaped "valid email is required" message has been removed so
  // probing a malformed input doesn't earn the caller a different
  // response shape.
  if (!email || !isValidEmail(email)) {
    await padToMinDuration(start);
    return NextResponse.json({ token: '' });
  }

  const admin = createAdmin(config);
  let token = '';
  try {
    token = await resolveToken(admin, email);
  } catch (resolveError) {
    console.error('[invites/resolve-by-email] unexpected error:', resolveError);
    token = '';
  }

  await padToMinDuration(start);
  return NextResponse.json({ token });
}
