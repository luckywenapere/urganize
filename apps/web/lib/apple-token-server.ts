import { createSign } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server half of Sign in with Apple (2026-10-01).
 *
 * Apple's rule 5.1.1(v), plus its own requirement: when someone deletes their
 * account, any "Sign in with Apple" link to it must be revoked with Apple. To
 * do that we need a refresh token, and Apple only hands one over in exchange
 * for the one-use `authorizationCode` the iPhone app gets at sign-in. So at
 * sign-in the page sends that code here, we exchange it and keep the refresh
 * token (apple_sign_in_tokens), and account deletion revokes it.
 *
 * Hand-rolled with node:crypto rather than a library, the way lib/fcm-server.ts
 * signs its Google token: one ES256 signature and two form posts do not justify
 * a dependency.
 *
 * Everything here FAILS SOFT. With the four environment values unset it does
 * nothing at all (sign-in itself still works through Supabase), and a failed
 * revoke never blocks deleting an account: the person's right to leave outranks
 * our housekeeping, and the failure is logged.
 */
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
const REQUEST_TIMEOUT_MS = 8_000;
/** Apple allows up to six months; this secret is used once, immediately. */
const CLIENT_SECRET_LIFETIME_SECONDS = 300;

export type AppleSignInConfig = {
  teamId: string;
  keyId: string;
  /** The .p8 contents (an EC private key in PKCS#8 PEM). */
  privateKey: string;
  /** The app's bundle ID: the "client" for a native sign-in. */
  clientId: string;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Null when Sign in with Apple has not been set up on the server. */
export function getAppleSignInConfig(
  env: Record<string, string | undefined> = process.env
): AppleSignInConfig | null {
  const teamId = (env.APPLE_SIGN_IN_TEAM_ID ?? '').trim();
  const keyId = (env.APPLE_SIGN_IN_KEY_ID ?? '').trim();
  // Env values often carry the PEM's line breaks as the two characters \n.
  const privateKey = (env.APPLE_SIGN_IN_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim();
  const clientId = (env.APPLE_SIGN_IN_CLIENT_ID ?? 'com.urganize.app').trim();
  if (!teamId || !keyId || !privateKey || !clientId) return null;
  return { teamId, keyId, privateKey, clientId };
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/** The short-lived ES256 token Apple wants as the `client_secret`. */
export function buildAppleClientSecret(config: AppleSignInConfig, nowSeconds: number): string {
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }));
  const payload = base64Url(
    JSON.stringify({
      iss: config.teamId,
      iat: nowSeconds,
      exp: nowSeconds + CLIENT_SECRET_LIFETIME_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: config.clientId,
    })
  );
  const signingInput = `${header}.${payload}`;
  // JWS wants the raw r||s pair, not the DER encoding Node produces by default.
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key: config.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${base64Url(signature)}`;
}

async function postForm(
  url: string,
  fields: Record<string, string>,
  fetchImpl: FetchLike
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Trades the one-use code from the app for a refresh token. Null on any failure. */
export async function exchangeAppleAuthorizationCode(
  config: AppleSignInConfig,
  authorizationCode: string,
  fetchImpl: FetchLike = fetch,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<string | null> {
  try {
    const response = await postForm(
      APPLE_TOKEN_URL,
      {
        client_id: config.clientId,
        client_secret: buildAppleClientSecret(config, nowSeconds),
        code: authorizationCode,
        grant_type: 'authorization_code',
      },
      fetchImpl
    );
    if (!response.ok) {
      console.warn('[apple-sign-in] code exchange refused:', response.status);
      return null;
    }
    const payload = (await response.json().catch(() => null)) as { refresh_token?: unknown } | null;
    return typeof payload?.refresh_token === 'string' && payload.refresh_token
      ? payload.refresh_token
      : null;
  } catch (error) {
    console.warn('[apple-sign-in] code exchange failed:', error);
    return null;
  }
}

/** Tells Apple to forget this sign-in. True when Apple accepted it. */
export async function revokeAppleRefreshToken(
  config: AppleSignInConfig,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): Promise<boolean> {
  try {
    const response = await postForm(
      APPLE_REVOKE_URL,
      {
        client_id: config.clientId,
        client_secret: buildAppleClientSecret(config, nowSeconds),
        token: refreshToken,
        token_type_hint: 'refresh_token',
      },
      fetchImpl
    );
    if (!response.ok) console.warn('[apple-sign-in] revoke refused:', response.status);
    return response.ok;
  } catch (error) {
    console.warn('[apple-sign-in] revoke failed:', error);
    return false;
  }
}

/** Keeps (or replaces) the refresh token for this account. */
export async function storeAppleRefreshToken(
  adminClient: SupabaseClient,
  userId: string,
  refreshToken: string
): Promise<boolean> {
  const { error } = await adminClient
    .from('apple_sign_in_tokens')
    .upsert(
      { user_id: userId, refresh_token: refreshToken, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) {
    console.warn('[apple-sign-in] could not store the refresh token:', error.message);
    return false;
  }
  return true;
}

/**
 * Called when an account is deleted. Revokes the Apple link if there is one,
 * then drops the stored token. Never throws, never blocks the deletion.
 */
export async function revokeAppleSignInForUser(
  adminClient: SupabaseClient,
  userId: string,
  options: { config?: AppleSignInConfig | null; fetchImpl?: FetchLike } = {}
): Promise<'revoked' | 'none' | 'failed' | 'not_configured'> {
  try {
    const { data, error } = await adminClient
      .from('apple_sign_in_tokens')
      .select('refresh_token')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[apple-sign-in] could not read the stored token:', error.message);
      return 'failed';
    }
    const refreshToken = (data as { refresh_token?: string } | null)?.refresh_token;
    if (!refreshToken) return 'none';

    const config = options.config === undefined ? getAppleSignInConfig() : options.config;
    if (!config) return 'not_configured';

    const revoked = await revokeAppleRefreshToken(config, refreshToken, options.fetchImpl);
    if (revoked) {
      await adminClient.from('apple_sign_in_tokens').delete().eq('user_id', userId);
    }
    return revoked ? 'revoked' : 'failed';
  } catch (error) {
    console.warn('[apple-sign-in] revoke on delete threw:', error);
    return 'failed';
  }
}
