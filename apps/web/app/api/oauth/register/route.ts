// RFC 7591 Dynamic Client Registration (2026-08-25).
//
// UNAUTHENTICATED, and that is not an oversight. claude.ai and Claude Desktop
// have no way to be handed a client_id out of band — their custom-connector
// flow registers itself on connect and offers no field for one
// (anthropics/claude-ai-mcp#402). Open registration is therefore the price of
// working with the clients this feature exists for, and it is what every remote
// MCP server does.
//
// WHAT ACTUALLY PROTECTS ANYTHING HERE: registering a client grants nothing at
// all. A client_id is not a credential — it cannot read a release, cannot mint
// a token, and cannot do anything until a signed-in human reaches the consent
// screen and clicks Allow, at which point the code it receives is bound by PKCE
// to the exact client instance that started the flow. A junk registration is a
// junk row, not access.
//
// So the validation below is about two things and no others: keeping the table
// from filling with nonsense, and refusing a redirect target that could leak an
// authorization code (see isAllowedRedirectUri).

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { generateClientId, validateClientRegistration } from '@/lib/mcp/oauth';
import {
  MCP_OAUTH_CLIENTS_TABLE,
  createOauthAdminClient,
  oauthErrorResponse,
  requireMcpConnectEnabled,
} from '@/app/api/oauth/_shared';

export async function POST(request: NextRequest) {
  const gate = requireMcpConnectEnabled();
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  const validated = validateClientRegistration(body);
  if (!validated.ok) {
    return oauthErrorResponse(validated.error, validated.description);
  }

  const adminClient = createOauthAdminClient();
  if (!adminClient) {
    return oauthErrorResponse('server_error', 'Server environment is not configured.');
  }

  const clientId = generateClientId();
  const { error } = await adminClient.from(MCP_OAUTH_CLIENTS_TABLE).insert({
    client_id: clientId,
    client_name: validated.value.clientName,
    redirect_uris: validated.value.redirectUris,
  });

  if (error) {
    console.error('[mcp-oauth] client registration failed:', error.message);
    return oauthErrorResponse('server_error', 'Could not register the client.');
  }

  // RFC 7591 §3.2.1: 201, and echo back the metadata as registered so the
  // client can see what was actually stored rather than what it asked for.
  // No client_secret — these are public clients and the column does not exist.
  return NextResponse.json(
    {
      client_id: clientId,
      client_name: validated.value.clientName,
      redirect_uris: validated.value.redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
