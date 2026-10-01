import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  buildAppleClientSecret,
  exchangeAppleAuthorizationCode,
  getAppleSignInConfig,
  revokeAppleRefreshToken,
  revokeAppleSignInForUser,
  type AppleSignInConfig,
} from './apple-token-server';

const { privateKey, publicKey } = generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const CONFIG: AppleSignInConfig = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  privateKey,
  clientId: 'com.urganize.app',
};

function decodePart(part: string) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

describe('getAppleSignInConfig', () => {
  it('is null until all four values are set', () => {
    expect(getAppleSignInConfig({})).toBeNull();
    expect(
      getAppleSignInConfig({ APPLE_SIGN_IN_TEAM_ID: 't', APPLE_SIGN_IN_KEY_ID: 'k' })
    ).toBeNull();
  });

  it('defaults the client to the app bundle and unescapes the key line breaks', () => {
    const config = getAppleSignInConfig({
      APPLE_SIGN_IN_TEAM_ID: 't',
      APPLE_SIGN_IN_KEY_ID: 'k',
      APPLE_SIGN_IN_PRIVATE_KEY: 'line1\\nline2',
    });
    expect(config?.clientId).toBe('com.urganize.app');
    expect(config?.privateKey).toBe('line1\nline2');
  });
});

describe('buildAppleClientSecret', () => {
  const now = 1_800_000_000;
  const secret = buildAppleClientSecret(CONFIG, now);
  const [header, payload, signature] = secret.split('.');

  it('carries the claims Apple checks', () => {
    expect(decodePart(header)).toMatchObject({ alg: 'ES256', kid: 'KEY1234567' });
    expect(decodePart(payload)).toEqual({
      iss: 'TEAM123456',
      iat: now,
      exp: now + 300,
      aud: 'https://appleid.apple.com',
      sub: 'com.urganize.app',
    });
  });

  it('is signed in the raw r||s form a JWT needs, and verifies', () => {
    const raw = Buffer.from(signature, 'base64url');
    // P-256 gives 32 bytes each for r and s. A DER signature would be ~70.
    expect(raw.length).toBe(64);
    const verifier = createVerify('SHA256').update(`${header}.${payload}`);
    expect(
      verifier.verify({ key: createPublicKey(publicKey), dsaEncoding: 'ieee-p1363' }, raw)
    ).toBe(true);
  });

  it('does not verify if the payload is changed', () => {
    const forged = Buffer.from(JSON.stringify({ iss: 'someone else' })).toString('base64url');
    const verifier = createVerify('SHA256').update(`${header}.${forged}`);
    expect(
      verifier.verify(
        { key: createPublicKey(publicKey), dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url')
      )
    ).toBe(false);
  });
});

function fakeFetch(response: { ok: boolean; status?: number; body?: unknown }) {
  return vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: async () => response.body ?? {},
  })) as unknown as typeof fetch;
}

describe('exchangeAppleAuthorizationCode', () => {
  it('posts the code and returns the refresh token', async () => {
    const fetchImpl = fakeFetch({ ok: true, body: { refresh_token: 'r-token' } });
    const token = await exchangeAppleAuthorizationCode(CONFIG, 'one-use-code', fetchImpl);
    expect(token).toBe('r-token');
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://appleid.apple.com/auth/token');
    const body = new URLSearchParams(String((init as RequestInit).body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('one-use-code');
    expect(body.get('client_id')).toBe('com.urganize.app');
    expect(body.get('client_secret')?.split('.')).toHaveLength(3);
  });

  it('returns null when Apple refuses or answers without a token', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await exchangeAppleAuthorizationCode(CONFIG, 'c', fakeFetch({ ok: false }))).toBeNull();
    expect(await exchangeAppleAuthorizationCode(CONFIG, 'c', fakeFetch({ ok: true, body: {} }))).toBeNull();
  });

  it('returns null rather than throwing when the network fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await exchangeAppleAuthorizationCode(CONFIG, 'c', failing)).toBeNull();
  });
});

describe('revokeAppleRefreshToken', () => {
  it('posts the token to the revoke endpoint', async () => {
    const fetchImpl = fakeFetch({ ok: true });
    expect(await revokeAppleRefreshToken(CONFIG, 'r-token', fetchImpl)).toBe(true);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    const body = new URLSearchParams(String((init as RequestInit).body));
    expect(body.get('token')).toBe('r-token');
    expect(body.get('token_type_hint')).toBe('refresh_token');
  });

  it('is false when Apple refuses', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await revokeAppleRefreshToken(CONFIG, 'r', fakeFetch({ ok: false }))).toBe(false);
  });
});

function adminWith(row: { refresh_token: string } | null, readError: unknown = null) {
  const deleted: string[] = [];
  const admin = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: readError }) }),
      }),
      delete: () => ({
        eq: async (_column: string, value: string) => {
          deleted.push(value);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { admin, deleted };
}

describe('revokeAppleSignInForUser (what account deletion calls)', () => {
  it('revokes and then removes the stored token', async () => {
    const { admin, deleted } = adminWith({ refresh_token: 'r-token' });
    const result = await revokeAppleSignInForUser(admin, 'user-1', {
      config: CONFIG,
      fetchImpl: fakeFetch({ ok: true }),
    });
    expect(result).toBe('revoked');
    expect(deleted).toEqual(['user-1']);
  });

  it('does nothing for someone who never signed in with Apple', async () => {
    const { admin } = adminWith(null);
    expect(await revokeAppleSignInForUser(admin, 'user-1', { config: CONFIG })).toBe('none');
  });

  it('skips quietly when the server is not set up for Apple', async () => {
    const { admin } = adminWith({ refresh_token: 'r-token' });
    expect(await revokeAppleSignInForUser(admin, 'user-1', { config: null })).toBe('not_configured');
  });

  it('keeps the token and reports failure if Apple refuses, but never throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { admin, deleted } = adminWith({ refresh_token: 'r-token' });
    const result = await revokeAppleSignInForUser(admin, 'user-1', {
      config: CONFIG,
      fetchImpl: fakeFetch({ ok: false }),
    });
    expect(result).toBe('failed');
    expect(deleted).toEqual([]);
  });

  it('does not throw when the read itself fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { admin } = adminWith(null, { message: 'down' });
    expect(await revokeAppleSignInForUser(admin, 'user-1', { config: CONFIG })).toBe('failed');
  });
});
