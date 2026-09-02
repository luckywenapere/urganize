// Disconnect one app (2026-08-25).
//
// Like its parent, NOT behind the paywall — cutting off a credential must never
// depend on a subscription being current. This is the single most important
// route in the per-user MCP feature: it is the answer to "what if I connect
// something and regret it", and .env.example used to say, of the founder key,
// "there is no revocation UI".
//
// A soft revoke (stamping revoked_at) rather than a delete, the
// workspace_invite_links precedent: the row stays so the user can see they
// disconnected it rather than wondering where it went, and it loses every
// affordance. Idempotent, so a double-tap on a slow connection is a success
// rather than an error.
//
// Revoking kills BOTH tokens at once, which is why the row is the unit: the
// access token is checked against revoked_at on every request, and the refresh
// rotation in /api/oauth/token requires revoked_at to be null.

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { blockCuratorAccount, getAuthenticatedUser } from '@/app/api/_shared/auth';
import {
  MCP_OAUTH_TOKENS_TABLE,
  createOauthAdminClient,
  requireMcpConnectEnabled,
} from '@/app/api/oauth/_shared';

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const gate = requireMcpConnectEnabled();
  if (gate) return gate;

  const auth = await getAuthenticatedUser(request);
  if ('error' in auth) return auth.error;

  const curatorBlock = await blockCuratorAccount(auth.user.id, auth.supabaseUrl);
  if (curatorBlock) return curatorBlock;

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'Missing connection id.' }, { status: 400 });

  const adminClient = createOauthAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: 'Server environment is not configured' }, { status: 500 });
  }

  // Scoped to the caller's own rows, so somebody else's connection id resolves
  // to "not found" rather than to a revocable row.
  const existing = await adminClient
    .from(MCP_OAUTH_TOKENS_TABLE)
    .select('id,revoked_at')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (existing.error) {
    console.error('[mcp-oauth] connection lookup failed:', existing.error.message);
    return NextResponse.json({ error: 'Could not disconnect that app.' }, { status: 500 });
  }
  if (!existing.data) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if ((existing.data as { revoked_at: string | null }).revoked_at) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  const { error } = await adminClient
    .from(MCP_OAUTH_TOKENS_TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', auth.user.id);

  if (error) {
    console.error('[mcp-oauth] revoke failed:', error.message);
    return NextResponse.json({ error: 'Could not disconnect that app.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
