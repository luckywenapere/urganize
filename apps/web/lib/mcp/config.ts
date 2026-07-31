// Server-side MCP access config. The MCP endpoint exposes Chappi's existing
// tool surface to an external MCP client (Claude Code / Claude Desktop) over
// HTTP with a plain bearer key — no OAuth, no per-user keys, no DB table.
//
// Access is bound to exactly ONE account by env: a caller holding
// MCP_ACCESS_KEY acts as MCP_USER_ID and nobody else. That single-actor
// binding is what lets the internal-actor branch in app/api/_shared/auth.ts
// stay safe without an acting-user header — see the URG-183 note in CLAUDE.md.
//
// Presence of BOTH vars is the feature switch: unset → the route 404s (dark,
// mirroring the flag-off 404 in app/api/chappi/route.ts). There is no
// NEXT_PUBLIC_FEATURE_MCP because nothing about this ships to the client
// bundle, and a separate flag would only create a half-configured state.

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
