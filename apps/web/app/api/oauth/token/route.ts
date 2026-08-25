// The token endpoint (2026-08-25): authorization_code and refresh_token.
//
// UNAUTHENTICATED in the session sense — the credential IS the grant being
// presented. These are public clients, so there is no client_secret to check;
// what stands in for it is PKCE on the code exchange and possession of the
// refresh token on a rotation.
//
// TWO ATOMICITY RULES, both enforced by a conditional UPDATE rather than by a
// read-then-write, because a read-then-write is a race and a race here means a
// replayed credential:
//
//   1. A code is single-use. It is consumed by
//      `update ... where consumed_at is null returning id` — zero rows means
//      somebody else won, and the exchange fails. The ROW is the lock. The
//      `consumedAt` check inside checkCodeRedemption is a fast path only; it is
//      NOT what makes single-use true, and removing this update in favour of it
//      would reintroduce the window.
//   2. A refresh token rotates in place. The same conditional-update shape
//      swaps both hashes on the existing row, so a replayed refresh token
//      matches nothing.
//
// One row per CONNECTION, not per token pair: rotation updates the row rather
// than inserting a successor, so an hourly refresh does not fill the owner's
// Settings list with dead entries.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  ACCESS_TOKEN_TTL_MS,
  ACCESS_TOKEN_TTL_SECONDS,
  checkCodeRedemption,
  generateOpaqueSecret,
  hashSecret,
  isoAfter,
  looksLikeOauthSecret,
  type StoredCode,
} from '@/lib/mcp/oauth';
import {
  MCP_OAUTH_CODES_TABLE,
  MCP_OAUTH_TOKENS_TABLE,
  createOauthAdminClient,
  loadOauthClient,
  oauthErrorResponse,
  readOauthFormBody,
  requireMcpConnectEnabled,
} from '@/app/api/oauth/_shared';
import type { SupabaseClient } from '@supabase/supabase-js';

/** One shared description for every attack-shaped failure. See lib/mcp/oauth.ts. */
const OPAQUE_GRANT_FAILURE = 'The authorization grant is not valid.';

export async function POST(request: NextRequest) {
  const gate = requireMcpConnectEnabled();
  if (gate) return gate;

  const form = await readOauthFormBody(request);
  const grantType = form.grant_type || '';

  const adminClient = createOauthAdminClient();
  if (!adminClient) {
    return oauthErrorResponse('server_error', 'Server environment is not configured.');
  }

  if (grantType === 'authorization_code') {
    return exchangeAuthorizationCode(adminClient, form);
  }
  if (grantType === 'refresh_token') {
    return rotateRefreshToken(adminClient, form);
  }
  return oauthErrorResponse(
    'unsupported_grant_type',
    'Only authorization_code and refresh_token are supported.'
  );
}

async function exchangeAuthorizationCode(
  adminClient: SupabaseClient,
  form: Record<string, string>
): Promise<NextResponse> {
  const code = (form.code || '').trim();
  const clientId = (form.client_id || '').trim();
  const redirectUri = (form.redirect_uri || '').trim();
  const verifier = (form.code_verifier || '').trim();

  if (!code || !clientId || !redirectUri || !verifier) {
    return oauthErrorResponse(
      'invalid_request',
      'code, client_id, redirect_uri and code_verifier are all required.'
    );
  }
  // Shape gate before any query, so junk never reaches Postgres.
  if (!looksLikeOauthSecret(code)) {
    return oauthErrorResponse('invalid_grant', OPAQUE_GRANT_FAILURE);
  }

  const client = await loadOauthClient(adminClient, clientId);
  if (!client) return oauthErrorResponse('invalid_client', 'Unknown client.');

  const { data, error } = await adminClient
    .from(MCP_OAUTH_CODES_TABLE)
    .select('id,client_id,user_id,redirect_uri,code_challenge,code_challenge_method,expires_at,consumed_at')
    .eq('code_hash', hashSecret(code))
    .maybeSingle();

  if (error) {
    console.error('[mcp-oauth] code lookup failed:', error.message);
    return oauthErrorResponse('server_error', 'Could not complete the exchange.');
  }
  if (!data) return oauthErrorResponse('invalid_grant', OPAQUE_GRANT_FAILURE);

  const row = data as {
    id: string;
    client_id: string;
    user_id: string;
    redirect_uri: string;
    code_challenge: string;
    code_challenge_method: string;
    expires_at: string;
    consumed_at: string | null;
  };

  const stored: StoredCode = {
    clientId: row.client_id,
    userId: row.user_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: row.code_challenge_method,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };

  const verdict = checkCodeRedemption({
    code: stored,
    clientId,
    redirectUri,
    verifier,
    now: new Date(),
  });
  if (!verdict.ok) {
    return oauthErrorResponse(verdict.error, verdict.description);
  }

  // Rule 1: the row is the lock. Zero rows back means a concurrent exchange
  // already claimed this code, and this one must fail even though every check
  // above passed.
  const claim = await adminClient
    .from(MCP_OAUTH_CODES_TABLE)
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();

  if (claim.error || !claim.data) {
    return oauthErrorResponse('invalid_grant', OPAQUE_GRANT_FAILURE);
  }

  const accessToken = generateOpaqueSecret();
  const refreshToken = generateOpaqueSecret();
  const now = new Date();

  const insert = await adminClient.from(MCP_OAUTH_TOKENS_TABLE).insert({
    token_hash: hashSecret(accessToken),
    refresh_hash: hashSecret(refreshToken),
    client_id: client.client_id,
    client_name: client.client_name,
    user_id: row.user_id,
    expires_at: isoAfter(now, ACCESS_TOKEN_TTL_MS),
  });

  if (insert.error) {
    console.error('[mcp-oauth] token insert failed:', insert.error.message);
    // The code is spent either way. Failing here costs the user one more click
    // through the consent screen, which is far better than handing out a token
    // we did not record and cannot revoke.
    return oauthErrorResponse('server_error', 'Could not issue a token.');
  }

  return tokenResponse(accessToken, refreshToken);
}

async function rotateRefreshToken(
  adminClient: SupabaseClient,
  form: Record<string, string>
): Promise<NextResponse> {
  const refreshToken = (form.refresh_token || '').trim();
  if (!refreshToken) {
    return oauthErrorResponse('invalid_request', 'refresh_token is required.');
  }
  if (!looksLikeOauthSecret(refreshToken)) {
    return oauthErrorResponse('invalid_grant', OPAQUE_GRANT_FAILURE);
  }

  const nextAccess = generateOpaqueSecret();
  const nextRefresh = generateOpaqueSecret();
  const now = new Date();

  // Rule 2: rotate in place, conditionally. Matching on the OLD refresh hash
  // and requiring revoked_at to be null means a replayed refresh token — or one
  // presented after the owner revoked the connection — updates zero rows.
  //
  // `client_id` is deliberately NOT required to match here: RFC 6749 §6 lets a
  // public client refresh without authenticating, and the refresh token itself
  // is the only thing that could bind the request. Demanding a client_id would
  // add no security (it is public) and would break clients that omit it.
  const { data, error } = await adminClient
    .from(MCP_OAUTH_TOKENS_TABLE)
    .update({
      token_hash: hashSecret(nextAccess),
      refresh_hash: hashSecret(nextRefresh),
      expires_at: isoAfter(now, ACCESS_TOKEN_TTL_MS),
      last_used_at: now.toISOString(),
    })
    .eq('refresh_hash', hashSecret(refreshToken))
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[mcp-oauth] refresh rotation failed:', error.message);
    return oauthErrorResponse('server_error', 'Could not refresh the token.');
  }
  if (!data) return oauthErrorResponse('invalid_grant', OPAQUE_GRANT_FAILURE);

  return tokenResponse(nextAccess, nextRefresh);
}

/** RFC 6749 §5.1. `no-store` is required there, not merely advisable. */
function tokenResponse(accessToken: string, refreshToken: string): NextResponse {
  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: 'mcp',
    },
    { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } }
  );
}
