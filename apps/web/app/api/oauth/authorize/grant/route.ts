// The consent decision (2026-08-25). Called by /oauth/authorize AFTER the user
// clicks Allow — never before, and never by a third party.
//
// This is the one route in the OAuth group that needs a real Urganize session,
// because it is the only one where a HUMAN is making a decision. Everything the
// client sent (client_id, redirect_uri, PKCE challenge) is re-validated here
// against the registered row rather than trusted from the page, so a tampered
// consent screen cannot widen what it grants.
//
// WHY THE SPLIT AUTH CALLS INSTEAD OF requireActiveAuthenticatedUser:
// that helper passes request.method into the paywall, and this is a POST — so a
// team whose payment lapsed (read-only mode) would be refused a connection
// outright. In-app, a read-only team can still read everything; an MCP
// connection is HOW they would read it from their own LLM, and the per-tool gate
// in /api/mcp already refuses their writes. Blocking the connection as well
// would be stricter than the app they are looking at. So the paywall is
// consulted at read grade, deliberately, and the curator block is applied by
// hand because taking the split path skips it.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { blockCuratorAccount, getAuthenticatedUser } from '@/app/api/_shared/auth';
import { requireActiveAccount } from '@/app/api/_shared/paywall';
import {
  AUTHORIZATION_CODE_TTL_MS,
  generateOpaqueSecret,
  hashSecret,
  isRegisteredRedirectUri,
  isSupportedCodeChallengeMethod,
  isoAfter,
} from '@/lib/mcp/oauth';
import {
  MCP_OAUTH_CODES_TABLE,
  createOauthAdminClient,
  loadOauthClient,
  oauthErrorResponse,
  requireMcpConnectEnabled,
} from '@/app/api/oauth/_shared';

export async function POST(request: NextRequest) {
  const gate = requireMcpConnectEnabled();
  if (gate) return gate;

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const curatorBlock = await blockCuratorAccount(auth.user.id, auth.supabaseUrl);
  if (curatorBlock) return curatorBlock;

  // Read grade — see the header. A walled team still gets the wall.
  const paywallBlock = await requireActiveAccount(auth.user.id, auth.user.email, 'GET');
  if (paywallBlock) return paywallBlock;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri.trim() : '';
  const codeChallenge =
    typeof body.code_challenge === 'string' ? body.code_challenge.trim() : '';
  const codeChallengeMethod =
    typeof body.code_challenge_method === 'string' ? body.code_challenge_method.trim() : 'S256';
  const resource = typeof body.resource === 'string' ? body.resource.trim() : null;

  if (!clientId || !redirectUri) {
    return oauthErrorResponse('invalid_request', 'client_id and redirect_uri are required.');
  }
  // PKCE is mandatory, not negotiated. These are public clients with no secret,
  // so the challenge is the ONLY thing binding a code to the instance that
  // asked for it — a flow without one is not worth completing.
  if (!codeChallenge) {
    return oauthErrorResponse('invalid_request', 'code_challenge is required.');
  }
  if (!isSupportedCodeChallengeMethod(codeChallengeMethod)) {
    return oauthErrorResponse('invalid_request', 'Only the S256 code challenge method is supported.');
  }

  const adminClient = createOauthAdminClient();
  if (!adminClient) {
    return oauthErrorResponse('server_error', 'Server environment is not configured.');
  }

  const client = await loadOauthClient(adminClient, clientId);
  if (!client) {
    return oauthErrorResponse('invalid_client', 'Unknown client.');
  }

  // Exact match against the registered set. This is the open-redirect guard:
  // anything looser hands the authorization code to whoever asked for it.
  if (!isRegisteredRedirectUri(redirectUri, client.redirect_uris)) {
    return oauthErrorResponse(
      'invalid_request',
      'That redirect_uri is not registered for this client.'
    );
  }

  const code = generateOpaqueSecret();
  const now = new Date();
  const { error } = await adminClient.from(MCP_OAUTH_CODES_TABLE).insert({
    code_hash: hashSecret(code),
    client_id: client.client_id,
    user_id: auth.user.id,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    resource,
    expires_at: isoAfter(now, AUTHORIZATION_CODE_TTL_MS),
  });

  if (error) {
    console.error('[mcp-oauth] could not issue an authorization code:', error.message);
    return oauthErrorResponse('server_error', 'Could not complete the authorization.');
  }

  // The page redirects the browser; this route only mints. Returning the code
  // as JSON rather than issuing a 302 keeps the redirect in the client
  // component, where it can preserve `state` and handle a Deny without a
  // second endpoint.
  return NextResponse.json(
    { code, redirect_uri: redirectUri },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
