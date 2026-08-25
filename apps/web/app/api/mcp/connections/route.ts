// The apps a user has connected over MCP (2026-08-25).
//
// DELIBERATELY NOT BEHIND THE PAYWALL, and this is the same call
// app/api/account/export makes for the same reason: the people who most need to
// see and cut off a credential are exactly the ones a billing wall would stop.
// A walled or read-only team must always be able to disconnect an app. So the
// gate is authentication plus the curator block, and nothing else — see the
// DELETE sibling, which is the one that matters.
//
// Reads are user-scoped, never workspace-scoped: a token belongs to the person
// who approved it, not to their team, so nobody sees anybody else's
// connections.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { blockCuratorAccount, getAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  MCP_OAUTH_TOKENS_TABLE,
  createOauthAdminClient,
  requireMcpConnectEnabled,
} from '@/app/api/oauth/_shared';
import { resolveMcpConnectionState, type McpConnection } from '@/lib/mcp-connections';

export async function GET(request: NextRequest) {
  const gate = requireMcpConnectEnabled();
  if (gate) return gate;

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const curatorBlock = await blockCuratorAccount(auth.user.id, auth.supabaseUrl);
  if (curatorBlock) return curatorBlock;

  const adminClient = createOauthAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // Never selects token_hash or refresh_hash. Not a performance choice: those
  // columns are the credential, and a list endpoint has no business being able
  // to leak one even by mistake — the CURATOR_PITCH_COLUMNS reasoning.
  const { data, error } = await adminClient
    .from(MCP_OAUTH_TOKENS_TABLE)
    .select('id,client_name,created_at,last_used_at,expires_at,revoked_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    // An unapplied migration reads as "no connections yet" rather than an
    // error, so the section renders its empty state instead of a red box on an
    // environment where the feature simply is not set up.
    console.warn('[mcp-oauth] connections list failed:', error.message);
    return NextResponse.json({ connections: [], degraded: true });
  }

  const rows = (Array.isArray(data) ? data : []) as Array<{
    id: string;
    client_name: string;
    created_at: string;
    last_used_at: string | null;
    expires_at: string;
    revoked_at: string | null;
  }>;

  const connections: McpConnection[] = rows.map((row) => ({
    id: row.id,
    clientName: row.client_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    state: resolveMcpConnectionState({ revokedAt: row.revoked_at, expiresAt: row.expires_at }),
  }));

  return NextResponse.json({ connections });
}

// Nothing here mints a connection: that only ever happens through the consent
// screen at /oauth/authorize. So there is no POST, and deliberately no stub
// returning 404 either — Next answers an undefined method with 405, which is
// the more truthful answer than pretending the route does not exist.
