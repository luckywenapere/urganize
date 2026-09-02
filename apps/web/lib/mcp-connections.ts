// Connected apps: the shared shape and rules for a user's MCP connections
// (2026-08-25).
//
// Pure and client-safe on purpose — the Settings section and the API route both
// import from here, so the state a row can be in and the words used for it
// cannot drift between what the user sees and what the server decides. The
// lib/team-logins.ts precedent.
//
// Note what is NOT here: the token. A connection's access and refresh tokens are
// stored hashed and never leave the server, so unlike a team login there is
// nothing to copy and no reason for the client to ever hold one.

/** Client-safe flag read. Inlined at build time, so the section and the routes
 *  cannot disagree about whether the feature exists. */
export const MCP_CONNECT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MCP_CONNECT === 'true';

export type McpConnectionState = 'active' | 'expired' | 'revoked';

export type McpConnection = {
  id: string;
  /** What the client called itself when the user approved it. */
  clientName: string;
  createdAt: string;
  lastUsedAt: string | null;
  state: McpConnectionState;
};

/**
 * Which state a row is in.
 *
 * Revocation outranks expiry, and that ordering is the honest one: a user who
 * revoked a connection should see it say "revoked", not "expired", even though
 * both are equally dead. Only the first is something they did.
 *
 * An access token expires hourly and the client refreshes it silently, so
 * `expired` is NOT the normal end of a live connection — it means nothing has
 * refreshed in over an hour, which for a connected app means it stopped being
 * used. Presented as its own state rather than lumped in with revoked so the
 * user can tell "I turned this off" from "this app stopped calling".
 */
export function resolveMcpConnectionState(input: {
  revokedAt: string | null;
  expiresAt: string;
  now?: Date;
}): McpConnectionState {
  if (input.revokedAt) return 'revoked';
  const expiresAt = Date.parse(input.expiresAt);
  const now = (input.now ?? new Date()).getTime();
  // An unparseable expiry counts as expired: the row cannot be trusted to be
  // live, and saying so is safer than implying it is.
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return 'expired';
  return 'active';
}

/** Is there anything left to revoke? */
export function isMcpConnectionRevocable(state: McpConnectionState): boolean {
  // An EXPIRED connection is still revocable, and that is the point: its
  // refresh token is what actually carries the grant, and that outlives the
  // hourly access token. "Expired" here means idle, not harmless.
  return state !== 'revoked';
}

/** One line under the app's name. */
export function describeMcpConnection(connection: McpConnection): string {
  if (connection.state === 'revoked') return 'Disconnected';
  if (!connection.lastUsedAt) return 'Never used';
  return `Last used ${formatDay(connection.lastUsedAt)}`;
}

function formatDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'recently';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}
