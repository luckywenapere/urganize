// Tests for the OAuth 2.1 primitives behind per-user MCP access.
//
// These matter more than most tests in this repo. A hand-rolled authorization
// server fails in three specific places — PKCE verification, redirect_uri
// matching and single-use codes — and all three fail SILENTLY: the flow still
// completes, it just completes for the wrong party. Nothing about that shows up
// in a build, a lint or a manual click-through. So each of those three has a
// test written to fail if the check is loosened, and each was mutation-tested
// by loosening it on purpose.

import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_TTL_MS,
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_MS,
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  checkCodeRedemption,
  extractBearerToken,
  generateClientId,
  generateOpaqueSecret,
  hashSecret,
  isAllowedRedirectUri,
  isRegisteredRedirectUri,
  isSupportedCodeChallengeMethod,
  isTokenUsable,
  isoAfter,
  looksLikeOauthSecret,
  MAX_REDIRECT_URIS,
  oauthError,
  oauthErrorStatus,
  validateClientRegistration,
  verifyCodeChallenge,
  type StoredCode,
} from './oauth';

/** A spec-legal 43-char verifier and its S256 challenge. */
const verifier = 'a'.repeat(43);
const challenge = createHash('sha256').update(verifier).digest('base64url');

const NOW = new Date('2026-08-25T12:00:00.000Z');

function storedCode(overrides: Partial<StoredCode> = {}): StoredCode {
  return {
    clientId: 'urg_client',
    userId: 'user-1',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    expiresAt: new Date(NOW.getTime() + 30_000).toISOString(),
    consumedAt: null,
    ...overrides,
  };
}

function redemption(overrides: Partial<Parameters<typeof checkCodeRedemption>[0]> = {}) {
  return checkCodeRedemption({
    code: storedCode(),
    clientId: 'urg_client',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    verifier,
    now: NOW,
    ...overrides,
  });
}

describe('secrets', () => {
  it('mints URL-safe secrets that pass their own shape check', () => {
    for (let i = 0; i < 20; i += 1) {
      const secret = generateOpaqueSecret();
      expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(looksLikeOauthSecret(secret)).toBe(true);
    }
  });

  it('mints distinct secrets', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateOpaqueSecret()));
    expect(seen.size).toBe(50);
  });

  it('mints prefixed, distinct client ids', () => {
    const ids = Array.from({ length: 20 }, () => generateClientId());
    for (const id of ids) expect(id.startsWith('urg_')).toBe(true);
    expect(new Set(ids).size).toBe(20);
  });

  it('hashes to stable sha256 hex', () => {
    expect(hashSecret('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
    expect(hashSecret('abc')).toBe(hashSecret('abc'));
    expect(hashSecret('abc')).not.toBe(hashSecret('abd'));
    expect(hashSecret('abc')).toHaveLength(64);
  });

  it('rejects shapes that could not be one of our secrets', () => {
    expect(looksLikeOauthSecret('')).toBe(false);
    expect(looksLikeOauthSecret('short')).toBe(false);
    // A path traversal attempt, and a SQL-ish string: neither reaches the db.
    expect(looksLikeOauthSecret('../../etc/passwd-aaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(looksLikeOauthSecret("' or 1=1 --aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(looksLikeOauthSecret('a'.repeat(201))).toBe(false);
  });
});

describe('PKCE', () => {
  it('accepts the matching verifier', () => {
    expect(verifyCodeChallenge({ verifier, challenge, method: 'S256' })).toBe(true);
  });

  it('rejects a wrong verifier', () => {
    expect(verifyCodeChallenge({ verifier: 'b'.repeat(43), challenge, method: 'S256' })).toBe(false);
  });

  it('rejects plain, even when the verifier equals the challenge', () => {
    // The one case a `plain` implementation would wave through. OAuth 2.1
    // forbids plain and the metadata document never advertises it.
    expect(verifyCodeChallenge({ verifier, challenge: verifier, method: 'plain' })).toBe(false);
    expect(isSupportedCodeChallengeMethod('plain')).toBe(false);
    expect(isSupportedCodeChallengeMethod('S256')).toBe(true);
  });

  it('rejects an unknown method', () => {
    expect(verifyCodeChallenge({ verifier, challenge, method: 'S512' })).toBe(false);
    expect(verifyCodeChallenge({ verifier, challenge, method: '' })).toBe(false);
  });

  it('rejects a verifier outside RFC 7636 length bounds', () => {
    const short = 'a'.repeat(42);
    const long = 'a'.repeat(129);
    expect(
      verifyCodeChallenge({
        verifier: short,
        challenge: createHash('sha256').update(short).digest('base64url'),
        method: 'S256',
      })
    ).toBe(false);
    expect(
      verifyCodeChallenge({
        verifier: long,
        challenge: createHash('sha256').update(long).digest('base64url'),
        method: 'S256',
      })
    ).toBe(false);
  });

  it('rejects a verifier containing characters outside the unreserved set', () => {
    const bad = `${'a'.repeat(42)}/`;
    expect(
      verifyCodeChallenge({
        verifier: bad,
        challenge: createHash('sha256').update(bad).digest('base64url'),
        method: 'S256',
      })
    ).toBe(false);
  });

  it('rejects an empty challenge', () => {
    expect(verifyCodeChallenge({ verifier, challenge: '', method: 'S256' })).toBe(false);
  });

  it('rejects a challenge that merely shares a prefix', () => {
    // Guards against a truncating or prefix comparison.
    expect(
      verifyCodeChallenge({ verifier, challenge: challenge.slice(0, 20), method: 'S256' })
    ).toBe(false);
  });

  it('round-trips freshly generated verifiers', () => {
    for (let i = 0; i < 10; i += 1) {
      const v = randomBytes(32).toString('base64url');
      const c = createHash('sha256').update(v).digest('base64url');
      expect(verifyCodeChallenge({ verifier: v, challenge: c, method: 'S256' })).toBe(true);
    }
  });
});

describe('redirect_uri matching', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback', 'http://127.0.0.1:33418/callback'];

  it('accepts an exact match', () => {
    expect(isRegisteredRedirectUri(registered[0], registered)).toBe(true);
    expect(isRegisteredRedirectUri(registered[1], registered)).toBe(true);
  });

  it('rejects anything short of exact — this is the open-redirect guard', () => {
    // Every one of these passes a prefix, host-only or startsWith comparison.
    expect(isRegisteredRedirectUri('https://claude.ai', registered)).toBe(false);
    expect(
      isRegisteredRedirectUri('https://claude.ai/api/mcp/auth_callback/../evil', registered)
    ).toBe(false);
    expect(
      isRegisteredRedirectUri('https://claude.ai/api/mcp/auth_callback?next=evil', registered)
    ).toBe(false);
    expect(
      isRegisteredRedirectUri('https://claude.ai.evil.test/api/mcp/auth_callback', registered)
    ).toBe(false);
    expect(
      isRegisteredRedirectUri('https://evil.test/api/mcp/auth_callback', registered)
    ).toBe(false);
  });

  it('rejects an empty candidate and an empty registry', () => {
    expect(isRegisteredRedirectUri('', registered)).toBe(false);
    expect(isRegisteredRedirectUri(registered[0], [])).toBe(false);
    expect(isRegisteredRedirectUri(registered[0], null)).toBe(false);
  });
});

describe('registrable redirect URIs', () => {
  it('accepts https anywhere', () => {
    expect(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isAllowedRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
  });

  it('accepts http only on loopback (RFC 8252 §7.3)', () => {
    expect(isAllowedRedirectUri('http://127.0.0.1:33418/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://localhost:6274/oauth/callback')).toBe(true);
    expect(isAllowedRedirectUri('http://[::1]:8080/cb')).toBe(true);
  });

  it('rejects plain http off loopback — a code must never cross the wire in clear', () => {
    expect(isAllowedRedirectUri('http://claude.ai/cb')).toBe(false);
    expect(isAllowedRedirectUri('http://192.168.1.10/cb')).toBe(false);
    expect(isAllowedRedirectUri('http://127.0.0.1.evil.test/cb')).toBe(false);
  });

  it('rejects non-http schemes and unparseable values', () => {
    expect(isAllowedRedirectUri('javascript:alert(1)')).toBe(false);
    expect(isAllowedRedirectUri('data:text/html,x')).toBe(false);
    expect(isAllowedRedirectUri('file:///etc/passwd')).toBe(false);
    expect(isAllowedRedirectUri('not a url')).toBe(false);
    expect(isAllowedRedirectUri('')).toBe(false);
  });

  it('rejects a URI carrying a fragment (RFC 6749 §3.1.2)', () => {
    expect(isAllowedRedirectUri('https://claude.ai/cb#frag')).toBe(false);
  });
});

describe('client registration', () => {
  it('accepts a minimal claude.ai-shaped body', () => {
    const result = validateClientRegistration({
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.clientName).toBe('Claude');
    expect(result.value.redirectUris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });

  it('defaults a missing name rather than refusing the registration', () => {
    // RFC 7591 makes every metadata field optional, so an absent name is legal
    // — but the consent screen needs something to render.
    const result = validateClientRegistration({ redirect_uris: ['https://claude.ai/cb'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.clientName).toBe('An MCP client');
  });

  it('truncates an absurd name instead of rejecting it', () => {
    const result = validateClientRegistration({
      client_name: 'x'.repeat(500),
      redirect_uris: ['https://claude.ai/cb'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.clientName).toHaveLength(120);
  });

  it('deduplicates redirect_uris', () => {
    const result = validateClientRegistration({
      redirect_uris: ['https://claude.ai/cb', 'https://claude.ai/cb'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.redirectUris).toEqual(['https://claude.ai/cb']);
  });

  it('requires a non-empty redirect_uris array', () => {
    for (const body of [{}, { redirect_uris: [] }, { redirect_uris: 'https://claude.ai/cb' }]) {
      const result = validateClientRegistration(body);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBe('invalid_redirect_uri');
    }
  });

  it('caps how many URIs one client may register', () => {
    const result = validateClientRegistration({
      redirect_uris: Array.from({ length: MAX_REDIRECT_URIS + 1 }, (_, i) => `https://a.test/${i}`),
    });
    expect(result.ok).toBe(false);
  });

  it('refuses a registration containing one bad URI, not just an all-bad one', () => {
    const result = validateClientRegistration({
      redirect_uris: ['https://claude.ai/cb', 'http://evil.test/cb'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_redirect_uri');
  });

  it('refuses a confidential client', () => {
    const result = validateClientRegistration({
      redirect_uris: ['https://claude.ai/cb'],
      token_endpoint_auth_method: 'client_secret_post',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_client_metadata');
  });

  it('accepts an explicit public client', () => {
    const result = validateClientRegistration({
      redirect_uris: ['https://claude.ai/cb'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
    });
    expect(result.ok).toBe(true);
  });

  it('refuses a grant type we do not implement', () => {
    const result = validateClientRegistration({
      redirect_uris: ['https://claude.ai/cb'],
      grant_types: ['authorization_code', 'implicit'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_client_metadata');
  });

  it('survives junk input', () => {
    for (const body of [null, undefined, 'nope', 42, []]) {
      expect(validateClientRegistration(body).ok).toBe(false);
    }
  });
});

describe('code redemption', () => {
  it('accepts a valid redemption', () => {
    expect(redemption()).toEqual({ ok: true });
  });

  it('refuses an already-consumed code', () => {
    const result = redemption({ code: storedCode({ consumedAt: NOW.toISOString() }) });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_grant');
  });

  it('refuses an expired code', () => {
    const result = redemption({
      code: storedCode({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }),
    });
    expect(result.ok).toBe(false);
  });

  it('treats the exact expiry instant as expired', () => {
    const result = redemption({ code: storedCode({ expiresAt: NOW.toISOString() }) });
    expect(result.ok).toBe(false);
  });

  it('refuses an unparseable expiry rather than trusting it', () => {
    const result = redemption({ code: storedCode({ expiresAt: 'not a date' }) });
    expect(result.ok).toBe(false);
  });

  it('refuses redemption by a different client', () => {
    const result = redemption({ clientId: 'urg_other' });
    expect(result.ok).toBe(false);
  });

  it('refuses a mismatched redirect_uri, and says so — a config bug, not an attack', () => {
    const result = redemption({ redirectUri: 'https://claude.ai/other' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('invalid_grant');
    expect(result.description).toMatch(/redirect_uri/);
  });

  it('refuses a wrong PKCE verifier', () => {
    const result = redemption({ verifier: 'b'.repeat(43) });
    expect(result.ok).toBe(false);
  });

  it('gives one indistinguishable description for every attack-shaped failure', () => {
    // Telling a holder of a stolen code WHICH part of their guess was wrong is
    // an oracle. Only the redirect_uri case differs, and that one is a
    // developer's own misconfiguration.
    const descriptions = [
      redemption({ code: storedCode({ consumedAt: NOW.toISOString() }) }),
      redemption({ code: storedCode({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }) }),
      redemption({ clientId: 'urg_other' }),
      redemption({ verifier: 'b'.repeat(43) }),
    ].map((result) => (result.ok ? 'ok' : result.description));

    expect(new Set(descriptions).size).toBe(1);
  });
});

describe('token usability', () => {
  it('accepts a live token', () => {
    expect(
      isTokenUsable({ userId: 'u', expiresAt: isoAfter(NOW, 60_000), revokedAt: null }, NOW)
    ).toBe(true);
  });

  it('refuses a revoked token even while unexpired', () => {
    expect(
      isTokenUsable(
        { userId: 'u', expiresAt: isoAfter(NOW, 60_000), revokedAt: NOW.toISOString() },
        NOW
      )
    ).toBe(false);
  });

  it('refuses an expired token', () => {
    expect(
      isTokenUsable({ userId: 'u', expiresAt: isoAfter(NOW, -1), revokedAt: null }, NOW)
    ).toBe(false);
  });

  it('refuses an unparseable expiry', () => {
    expect(isTokenUsable({ userId: 'u', expiresAt: '', revokedAt: null }, NOW)).toBe(false);
  });
});

describe('bearer extraction', () => {
  it('reads a well-formed header', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
  });

  it('is case-insensitive on the scheme, per RFC 7235', () => {
    expect(extractBearerToken('bearer abc123')).toBe('abc123');
    expect(extractBearerToken('BEARER abc123')).toBe('abc123');
  });

  it('tolerates extra whitespace', () => {
    expect(extractBearerToken('  Bearer   abc123  ')).toBe('abc123');
  });

  it('returns empty for anything else', () => {
    expect(extractBearerToken(null)).toBe('');
    expect(extractBearerToken(undefined)).toBe('');
    expect(extractBearerToken('')).toBe('');
    expect(extractBearerToken('abc123')).toBe('');
    expect(extractBearerToken('Basic abc123')).toBe('');
    expect(extractBearerToken('Bearer')).toBe('');
    expect(extractBearerToken('Bearer ')).toBe('');
  });
});

describe('error shapes', () => {
  it('answers invalid_client with 401 and everything else caller-side with 400', () => {
    expect(oauthErrorStatus('invalid_client')).toBe(401);
    expect(oauthErrorStatus('invalid_grant')).toBe(400);
    expect(oauthErrorStatus('invalid_request')).toBe(400);
    expect(oauthErrorStatus('invalid_redirect_uri')).toBe(400);
    expect(oauthErrorStatus('server_error')).toBe(500);
  });

  it('never answers 402 — the fetch interceptor would eject the browser to /locked', () => {
    const codes = [
      'invalid_request',
      'invalid_client',
      'invalid_grant',
      'unauthorized_client',
      'unsupported_grant_type',
      'invalid_redirect_uri',
      'invalid_client_metadata',
      'access_denied',
      'server_error',
    ] as const;
    for (const code of codes) expect(oauthErrorStatus(code)).not.toBe(402);
  });

  it('carries the RFC 6749 §5.2 body shape', () => {
    expect(oauthError('invalid_grant', 'nope')).toEqual({
      error: 'invalid_grant',
      error_description: 'nope',
    });
  });
});

describe('lifetimes', () => {
  it('keeps codes far below the RFC ten-minute ceiling', () => {
    expect(AUTHORIZATION_CODE_TTL_MS).toBeLessThanOrEqual(10 * 60 * 1000);
    expect(AUTHORIZATION_CODE_TTL_MS).toBeGreaterThan(0);
  });

  it('advertises expires_in in seconds, matching the millisecond constant', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(ACCESS_TOKEN_TTL_MS / 1000);
  });

  it('offsets from the injected clock, never the real one', () => {
    expect(isoAfter(NOW, 1000)).toBe('2026-08-25T12:00:01.000Z');
    expect(isoAfter(NOW, -1000)).toBe('2026-08-25T11:59:59.000Z');
  });
});

describe('metadata documents', () => {
  const baseUrl = 'https://app.urganize.app';

  it('points a client at the MCP endpoint and at itself as the issuer', () => {
    expect(buildProtectedResourceMetadata(baseUrl)).toMatchObject({
      resource: 'https://app.urganize.app/api/mcp',
      authorization_servers: ['https://app.urganize.app'],
    });
    expect(buildAuthorizationServerMetadata(baseUrl)).toMatchObject({
      issuer: baseUrl,
      authorization_endpoint: 'https://app.urganize.app/oauth/authorize',
      token_endpoint: 'https://app.urganize.app/api/oauth/token',
      registration_endpoint: 'https://app.urganize.app/api/oauth/register',
    });
  });

  it('advertises S256 only, and never the plain method', () => {
    const metadata = buildAuthorizationServerMetadata(baseUrl);
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']);
    expect(metadata.code_challenge_methods_supported).not.toContain('plain');
  });

  it('advertises only the grants and auth method we implement', () => {
    const metadata = buildAuthorizationServerMetadata(baseUrl);
    expect(metadata.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
    expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none']);
    expect(metadata.response_types_supported).toEqual(['code']);
  });

  it('emits absolute URLs, so a client never has to resolve them', () => {
    for (const value of Object.values(buildAuthorizationServerMetadata(baseUrl)).flat()) {
      if (typeof value === 'string' && value.includes('/')) {
        expect(value.startsWith('https://')).toBe(true);
      }
    }
  });
});
