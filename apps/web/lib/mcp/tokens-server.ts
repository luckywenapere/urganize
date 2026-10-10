// Resolving a per-user MCP access token to the account it belongs to
// (SERVER-ONLY, 2026-08-25).
//
// This is the counterpart to the env-bound founder key in ./config.ts, and it
// keeps that design's one security property intact: the credential IS the
// binding. A token row carries its own user_id, so a leaked token can act as
// exactly one account and no request header can redirect it — the same
// guarantee app/api/_shared/auth.ts makes about MCP_USER_ID, now with a
// revocation path.
//
// NEVER THROWS. Every failure — an unknown token, a revoked one, an expired
// one, an unapplied migration, a network blip — returns null, and the caller
// answers 401. That is deliberate on two counts: an outage must not be
// distinguishable from a bad credential, and a revoked token must look exactly
// like one that never existed.

import type { SupabaseClient } from '@supabase/supabase-js';
import { afterResponse } from '../after-response';
import { hashSecret, isTokenUsable, looksLikeOauthSecret } from './oauth';

const MCP_OAUTH_TOKENS_TABLE = 'mcp_oauth_tokens';

export type McpTokenActor = {
  tokenId: string;
  userId: string;
};

/**
 * Resolve a bearer token to its owner, or null.
 *
 * The shape check runs before the query — the same cheap gate lib/epk-server.ts
 * applies to share tokens, so a path-traversal string or a stray Supabase JWT
 * never reaches Postgres.
 *
 * `last_used_at` is touched fire-and-forget. It exists so the owner's Settings
 * list can say "last used three months ago", which is how somebody decides
 * which connection to revoke — but it is decoration on the hot path of every
 * MCP request, so a failed write is swallowed and never delays or fails the
 * call it is describing.
 */
export async function resolveMcpToken(
  adminClient: SupabaseClient,
  token: string
): Promise<McpTokenActor | null> {
  if (!token || !looksLikeOauthSecret(token)) return null;

  try {
    const { data, error } = await adminClient
      .from(MCP_OAUTH_TOKENS_TABLE)
      .select('id,user_id,expires_at,revoked_at')
      .eq('token_hash', hashSecret(token))
      .maybeSingle();

    if (error || !data) return null;

    const row = data as {
      id: string;
      user_id: string;
      expires_at: string;
      revoked_at: string | null;
    };

    if (
      !isTokenUsable(
        { userId: row.user_id, expiresAt: row.expires_at, revokedAt: row.revoked_at },
        new Date()
      )
    ) {
      return null;
    }

    const usedTokenId = row.id;
    afterResponse('mcp token last used', () => touchLastUsed(adminClient, usedTokenId));

    return { tokenId: row.id, userId: row.user_id };
  } catch (error) {
    console.error('[mcp-oauth] token resolution failed:', error);
    return null;
  }
}

async function touchLastUsed(adminClient: SupabaseClient, tokenId: string): Promise<void> {
  try {
    await adminClient
      .from(MCP_OAUTH_TOKENS_TABLE)
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', tokenId);
  } catch {
    // Decoration only. See the docstring above.
  }
}
