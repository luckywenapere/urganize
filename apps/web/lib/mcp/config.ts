// Server-side MCP access config. The MCP endpoint exposes Chappi's existing
// tool surface to an external MCP client over HTTP.
//
// TWO WAYS IN, and they are deliberately independent:
//
// 1. THE FOUNDER KEY (URG-183, 2026-07-31). A plain bearer key bound to
//    exactly ONE account by env: a caller holding MCP_ACCESS_KEY acts as
//    MCP_USER_ID and nobody else. Presence of BOTH vars is its feature switch;
//    unset, that path is simply unavailable. No NEXT_PUBLIC flag, because
//    nothing about it ships to the client bundle.
//
// 2. PER-USER OAUTH (2026-08-25). Every customer connects their own LLM client
//    and acts as themselves, gated by NEXT_PUBLIC_FEATURE_MCP_CONNECT. This
//    one DOES need a NEXT_PUBLIC flag because it has a client surface (the
//    consent screen and the Settings list). Tokens live in mcp_oauth_tokens;
//    see supabase/migrations/20260825100000_mcp_oauth.sql.
//
// The single-actor property the founder key relies on — that a leaked
// credential can only ever act as one account, with no acting-user header to
// redirect it — is preserved by (2) rather than abandoned: a token row carries
// its own user_id, so the credential is still the binding. What changes is
// that the binding lives in a row, which is also what makes revocation
// possible at all.

import { timingSafeEqual } from 'node:crypto';

export type McpConfig = {
  /** The shared bearer secret an MCP client must present. */
  accessKey: string;
  /** The auth.users id every MCP call acts as. */
  userId: string;
};

/** Resolve the MCP access config, or null when not fully configured. */
export function getMcpConfig(): McpConfig | null {
  const accessKey = String(process.env.MCP_ACCESS_KEY || '').trim();
  const userId = String(process.env.MCP_USER_ID || '').trim();
  if (!accessKey || !userId) return null;
  return { accessKey, userId };
}

/** True once the endpoint is configured to serve requests at all. */
export function isMcpConfigured(): boolean {
  return Boolean(getMcpConfig());
}

/**
 * Is per-user OAuth access switched on?
 *
 * NEXT_PUBLIC_ prefixed so it is inlined at build time for the consent page and
 * the Settings section, and read here so the routes and the UI cannot disagree
 * about whether the feature exists — the EPK/NOTES pattern. Off → every OAuth
 * route and both metadata documents 404, and /api/mcp still serves the founder
 * key exactly as before.
 */
export function isMcpConnectEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_MCP_CONNECT === 'true';
}

/**
 * Constant-time bearer check against MCP_ACCESS_KEY. Returns false when the
 * endpoint isn't configured, so callers can't authenticate against an empty
 * secret. Length is compared first because timingSafeEqual throws on a
 * mismatch — same pattern as verifyInviteLinkToken in lib/invite-link.ts.
 */
export function verifyMcpAccessKey(token: string): boolean {
  const config = getMcpConfig();
  if (!config || !token) return false;

  const provided = Buffer.from(token);
  const expected = Buffer.from(config.accessKey);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
