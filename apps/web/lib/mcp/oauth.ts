// The OAuth 2.1 authorization-server primitives behind per-user MCP access
// (2026-08-25). Hand-rolled, for the same reason lib/mcp/protocol.ts hand-rolls
// JSON-RPC and lib/fcm-server.ts hand-rolls an RS256 JWT: the surface is small,
// the alternative is a dependency plus its session machinery, and "boring
// stack" says no new frameworks in v1.
//
// EVERYTHING IN THIS FILE IS PURE. No env reads, no database, no Next imports,
// no clock except through an injected `now`. That is deliberate and
// load-bearing: PKCE verification, exact redirect-uri matching and single-use
// code semantics are precisely where a hand-rolled authorization server goes
// wrong, and the only way to hold them still is to test them directly. The
// routes are thin callers. See lib/mcp/oauth.test.ts.
//
// WHY OAUTH AT ALL, when a per-user bearer token would have been far less code:
// claude.ai web and Claude Desktop assume OAuth 2.1 and attempt Dynamic Client
// Registration on connect, with no "no auth" option and no static-header
// fallback. Claude Code would have been happy with a token; the managers this
// product is for would not have been able to connect at all. The full argument
// is in the header of supabase/migrations/20260825100000_mcp_oauth.sql.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// ── Lifetimes ───────────────────────────────────────────────────────────────

/**
 * 60 seconds. RFC 6749 §4.1.2 caps authorization codes at ten minutes and asks
 * for "as short as possible"; a code is exchanged by a program within a second
 * or two of the redirect, so a minute is already generous.
 */
export const AUTHORIZATION_CODE_TTL_MS = 60_000;

/**
 * One hour. Short enough that a leaked access token expires before it is much
 * use, long enough that a client is not refreshing mid-conversation. The
 * refresh token carries the durable grant.
 */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Advertised to clients as `expires_in`, which RFC 6749 defines in seconds. */
export const ACCESS_TOKEN_TTL_SECONDS = Math.floor(ACCESS_TOKEN_TTL_MS / 1000);

// ── Secrets ─────────────────────────────────────────────────────────────────

/**
 * 32 bytes → 43 URL-safe chars. Wider than the 18 bytes the release share
 * tokens use, because those guard a press kit and this one is a full API
 * credential.
 */
const SECRET_BYTES = 32;

/** An opaque, unguessable secret: authorization code, access or refresh token. */
export function generateOpaqueSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

/** A client_id. Not a secret, but deliberately not enumerable either. */
export function generateClientId(): string {
  return `urg_${randomBytes(16).toString('base64url')}`;
}

/**
 * sha256 hex, for storage.
 *
 * Deviates from every other token in this repo — nothing else in apps/web
 * hashes anything at rest, because share links and invite codes have to be
 * re-read to render a Copy button. An OAuth token is handed to a client once
 * and never shown to a human again, so nothing needs the plaintext back, and a
 * leaked database row should not be a working credential.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Shape check before any database round trip — the same cheap gate
 * lib/epk-server.ts and lib/capture-server.ts apply to share tokens, so junk
 * paths never reach Postgres.
 */
export const OAUTH_SECRET_SHAPE = /^[A-Za-z0-9_-]{20,200}$/;

export function looksLikeOauthSecret(value: string): boolean {
  return OAUTH_SECRET_SHAPE.test(value);
}

// ── PKCE (RFC 7636) ─────────────────────────────────────────────────────────

/**
 * S256 only. `plain` is permitted by RFC 7636 and forbidden by OAuth 2.1 for
 * anything but a client that genuinely cannot compute a hash; every MCP client
 * can, so accepting `plain` would only ever weaken a real flow. The metadata
 * document advertises S256 alone.
 */
export const SUPPORTED_CODE_CHALLENGE_METHODS = ['S256'] as const;

export type CodeChallengeMethod = (typeof SUPPORTED_CODE_CHALLENGE_METHODS)[number];

export function isSupportedCodeChallengeMethod(value: string): value is CodeChallengeMethod {
  return (SUPPORTED_CODE_CHALLENGE_METHODS as readonly string[]).includes(value);
}

/**
 * RFC 7636 §4.1: 43–128 characters from the unreserved set. Enforced rather
 * than assumed, because a client sending a two-character verifier would
 * otherwise get a technically-valid flow with no security value.
 */
export const CODE_VERIFIER_SHAPE = /^[A-Za-z0-9\-._~]{43,128}$/;

/**
 * BASE64URL(SHA256(ASCII(verifier))), compared in constant time.
 *
 * The comparison is the whole point of PKCE: it is what stops a stolen
 * authorization code being redeemed by anyone but the client that began the
 * flow. Length is checked before timingSafeEqual because that function throws
 * on mismatched buffers — the verifyInviteLinkToken / verifyMcpAccessKey
 * pattern.
 */
export function verifyCodeChallenge(input: {
  verifier: string;
  challenge: string;
  method: string;
}): boolean {
  if (!isSupportedCodeChallengeMethod(input.method)) return false;
  if (!CODE_VERIFIER_SHAPE.test(input.verifier)) return false;
  if (!input.challenge) return false;

  const computed = createHash('sha256').update(input.verifier).digest('base64url');
  const provided = Buffer.from(computed);
  const expected = Buffer.from(input.challenge);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

// ── redirect_uri validation ─────────────────────────────────────────────────

/**
 * Exact string equality against the registered set. Never a prefix match,
 * never host-only, never "starts with" — those are the classic open-redirect
 * holes, and an open redirect on an authorization endpoint hands the
 * authorization code to whoever asked for it.
 *
 * RFC 6749 §3.1.2.3 requires exact matching for anything but a single
 * registered URI, and OAuth 2.1 requires it unconditionally.
 */
export function isRegisteredRedirectUri(
  candidate: string,
  registered: readonly string[] | null | undefined
): boolean {
  if (!candidate) return false;
  const uris = registered || [];
  return uris.some((uri) => uri === candidate);
}

/**
 * What a client may register.
 *
 * HTTPS, or HTTP on loopback only. The loopback exception is RFC 8252 §7.3 and
 * is what lets a desktop client complete a flow against 127.0.0.1; allowing
 * plain HTTP anywhere else would put an authorization code on the wire in
 * clear. `localhost` is accepted alongside the literal loopback addresses
 * because every client in practice registers it, and a hostile `localhost`
 * resolution is not a threat this endpoint can do anything about.
 *
 * A fragment is rejected outright: RFC 6749 §3.1.2 forbids one, and a redirect
 * target carrying its own fragment cannot reliably receive the code.
 */
export function isAllowedRedirectUri(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol !== 'http:') return false;
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
}

/** Registration cap. Generous for a real client, bounded against a junk POST. */
export const MAX_REDIRECT_URIS = 8;
export const MAX_CLIENT_NAME_LENGTH = 120;

export type ClientRegistrationInput = {
  clientName: string;
  redirectUris: string[];
};

export type ClientRegistrationOutcome =
  | { ok: true; value: ClientRegistrationInput }
  | { ok: false; error: OauthErrorCode; description: string };

/**
 * Validate a Dynamic Client Registration body (RFC 7591).
 *
 * Registration is unauthenticated, which is what claude.ai needs and is
 * standard for MCP: the security boundary is the signed-in user's consent plus
 * PKCE, not a registration secret. So this function's job is to keep the table
 * from filling with nonsense and to refuse a redirect target that could leak a
 * code — not to decide who is allowed to ask.
 */
export function validateClientRegistration(body: unknown): ClientRegistrationOutcome {
  const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;

  const rawUris = payload.redirect_uris;
  if (!Array.isArray(rawUris) || rawUris.length === 0) {
    return {
      ok: false,
      error: 'invalid_redirect_uri',
      description: 'redirect_uris must be a non-empty array.',
    };
  }
  if (rawUris.length > MAX_REDIRECT_URIS) {
    return {
      ok: false,
      error: 'invalid_redirect_uri',
      description: `At most ${MAX_REDIRECT_URIS} redirect_uris may be registered.`,
    };
  }

  const redirectUris: string[] = [];
  for (const entry of rawUris) {
    if (typeof entry !== 'string' || !isAllowedRedirectUri(entry)) {
      return {
        ok: false,
        error: 'invalid_redirect_uri',
        description: 'Every redirect_uri must be https, or http on loopback.',
      };
    }
    if (!redirectUris.includes(entry)) redirectUris.push(entry);
  }

  // RFC 7591 makes every metadata field optional, so an absent name is a valid
  // registration rather than an error — but the consent screen and the owner's
  // Settings list both need something to show, and "this app" is a better thing
  // to read than a blank.
  const rawName = typeof payload.client_name === 'string' ? payload.client_name.trim() : '';
  const clientName = (rawName || 'An MCP client').slice(0, MAX_CLIENT_NAME_LENGTH);

  // Only `none` is accepted. These are public clients: no client_secret column
  // exists, and claude.ai cannot be handed one anyway.
  const authMethod = payload.token_endpoint_auth_method;
  if (typeof authMethod === 'string' && authMethod !== 'none') {
    return {
      ok: false,
      error: 'invalid_client_metadata',
      description: 'Only public clients are supported (token_endpoint_auth_method: "none").',
    };
  }

  const grantTypes = payload.grant_types;
  if (Array.isArray(grantTypes)) {
    const unsupported = grantTypes.filter(
      (grant) => grant !== 'authorization_code' && grant !== 'refresh_token'
    );
    if (unsupported.length) {
      return {
        ok: false,
        error: 'invalid_client_metadata',
        description: 'Only authorization_code and refresh_token grants are supported.',
      };
    }
  }

  return { ok: true, value: { clientName, redirectUris } };
}

// ── Error shapes (RFC 6749 §5.2, RFC 7591 §3.2.2) ───────────────────────────

export type OauthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_redirect_uri'
  | 'invalid_client_metadata'
  | 'access_denied'
  | 'server_error';

export type OauthErrorBody = {
  error: OauthErrorCode;
  error_description: string;
};

export function oauthError(error: OauthErrorCode, description: string): OauthErrorBody {
  return { error, error_description: description };
}

/**
 * The HTTP status each error travels with.
 *
 * `invalid_client` is 401 per RFC 6749 §5.2 and everything else that is the
 * caller's fault is 400. Note deliberately: none of these is ever 402.
 * lib/access-redirect.ts patches window.fetch to redirect the browser to
 * /locked on any same-origin 402, and the consent page runs in a browser — a
 * 402 here would eject the user mid-authorization.
 */
export function oauthErrorStatus(error: OauthErrorCode): number {
  if (error === 'invalid_client') return 401;
  if (error === 'server_error') return 500;
  return 400;
}

// ── Code and token validity ─────────────────────────────────────────────────

export type StoredCode = {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: string;
  consumedAt: string | null;
};

export type CodeRedemptionOutcome =
  | { ok: true }
  | { ok: false; error: OauthErrorCode; description: string };

/**
 * Everything that must hold for an authorization code to become a token,
 * checked in one place so a route cannot forget one.
 *
 * Every failure answers `invalid_grant` with the SAME description. That is not
 * laziness: distinguishing "expired" from "already used" from "wrong client"
 * tells an attacker holding a stolen code which part of their guess was right.
 * The one exception is a redirect_uri mismatch, which is a client-configuration
 * bug rather than an attack signal and is worth naming so a developer can fix
 * it.
 *
 * Single use is NOT checked here in a way a caller may rely on — `consumedAt`
 * is inspected as a fast path, but the real enforcement is the conditional
 * UPDATE ... WHERE consumed_at IS NULL RETURNING in the token route. A check
 * in application code is a read-then-write window; the row is the lock.
 */
export function checkCodeRedemption(input: {
  code: StoredCode;
  clientId: string;
  redirectUri: string;
  verifier: string;
  now: Date;
}): CodeRedemptionOutcome {
  const invalid = (description = 'The authorization code is not valid.'): CodeRedemptionOutcome => ({
    ok: false,
    error: 'invalid_grant',
    description,
  });

  if (input.code.consumedAt) return invalid();
  if (input.code.clientId !== input.clientId) return invalid();

  const expiresAt = Date.parse(input.code.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= input.now.getTime()) return invalid();

  if (input.code.redirectUri !== input.redirectUri) {
    return invalid('The redirect_uri does not match the one used to request this code.');
  }

  if (
    !verifyCodeChallenge({
      verifier: input.verifier,
      challenge: input.code.codeChallenge,
      method: input.code.codeChallengeMethod,
    })
  ) {
    return invalid();
  }

  return { ok: true };
}

export type StoredToken = {
  userId: string;
  expiresAt: string;
  revokedAt: string | null;
};

/**
 * Is this access token usable right now?
 *
 * Revocation beats expiry in the ordering only for readability — both answer
 * false, and no caller is told which. A caller gets a boolean precisely so a
 * revoked token and a made-up one are indistinguishable at the endpoint.
 */
export function isTokenUsable(token: StoredToken, now: Date): boolean {
  if (token.revokedAt) return false;
  const expiresAt = Date.parse(token.expiresAt);
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > now.getTime();
}

/** `Date` → the ISO string every timestamptz column in this repo stores. */
export function isoAfter(now: Date, ms: number): string {
  return new Date(now.getTime() + ms).toISOString();
}

// ── Bearer extraction ───────────────────────────────────────────────────────

/**
 * Pull a bearer token out of an Authorization header.
 *
 * Case-INSENSITIVE on the scheme, unlike the existing `authHeader.slice(7)` in
 * app/api/mcp/route.ts: RFC 7235 §2.1 says the scheme is case-insensitive, and
 * an OAuth client that sends "bearer" is within spec and should not be told its
 * credential is wrong.
 */
export function extractBearerToken(header: string | null | undefined): string {
  const value = String(header || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1].trim() : '';
}

// ── Metadata documents ──────────────────────────────────────────────────────

/** RFC 9728 protected-resource metadata. */
export function buildProtectedResourceMetadata(baseUrl: string) {
  return {
    resource: `${baseUrl}/api/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    resource_documentation: `${baseUrl}/docs/mcp`,
  };
}

/** RFC 8414 authorization-server metadata. */
export function buildAuthorizationServerMetadata(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/api/oauth/token`,
    registration_endpoint: `${baseUrl}/api/oauth/register`,
    scopes_supported: ['mcp'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: [...SUPPORTED_CODE_CHALLENGE_METHODS],
  };
}
