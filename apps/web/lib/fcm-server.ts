// SERVER ONLY — imports node:crypto. Only import from route handlers /
// server modules (push-server.ts, tasks-server.ts, cron), never from
// 'use client' code.
//
// Native push transport (FCM HTTP v1) for the native shell (apps/mobile).
// Web Push (push-server.ts / push.ts) can't reach Android/iOS webviews —
// neither has a PushManager — so this is a second transport fanned out to
// from the same choke point (sendPushToUsers / sendPushToAllUsers in
// push-server.ts), not a parallel feature.
//
// Deliberately hand-rolled instead of `firebase-admin` (~60MB, hurts Vercel
// cold starts) for the one endpoint we need: sign a short-lived OAuth token
// from the service account's private key, then POST to
// fcm.googleapis.com/v1/projects/{id}/messages:send. Same "boring stack"
// call as the hand-rolled MCP JSON-RPC layer.
//
// Env: FCM_SERVICE_ACCOUNT_JSON — the full Firebase service-account JSON
// (Project settings → Service accounts → Generate new private key), pasted
// as one line. Server-only; deliberately NOT in turbo.json (same as
// CRON_SECRET / CHAPPI_API_KEY).
//
// Degrades to a no-op when unset — device registration and sends never fail
// loudly because FCM isn't configured yet.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFcmMessage, classifyFcmError } from '@/lib/fcm';
import { PUSH_SEND_TIMEOUT_MS } from '@/lib/push-limits';
import type { PushPayload } from '@/lib/push-server';

export const DEVICE_PUSH_TOKENS_TABLE = 'device_push_tokens';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const TOKEN_REFRESH_SLACK_MS = 60_000;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let serviceAccount: ServiceAccount | null | undefined;
let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  if (serviceAccount !== undefined) return serviceAccount;

  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    serviceAccount = null;
    return serviceAccount;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      console.error('[fcm] FCM_SERVICE_ACCOUNT_JSON is missing required fields');
      serviceAccount = null;
      return serviceAccount;
    }
    serviceAccount = parsed as ServiceAccount;
  } catch (error) {
    console.error('[fcm] FCM_SERVICE_ACCOUNT_JSON is not valid JSON', error);
    serviceAccount = null;
  }

  return serviceAccount;
}

export function isFcmConfigured(): boolean {
  return loadServiceAccount() !== null;
}

function base64url(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(account: ServiceAccount): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs - TOKEN_REFRESH_SLACK_MS > now) {
    return cachedToken.accessToken;
  }

  try {
    // node:crypto is dynamically imported so this module stays side-effect
    // free at import time (matters for Vitest, which imports this file for
    // fcm-server.test.ts without a real service account configured).
    const { createSign } = await import('node:crypto');

    const nowSec = Math.floor(now / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claimSet = base64url(
      JSON.stringify({
        iss: account.client_email,
        scope: FCM_SCOPE,
        aud: account.token_uri || TOKEN_URI,
        iat: nowSec,
        exp: nowSec + 3600,
      })
    );
    const signInput = `${header}.${claimSet}`;
    const signer = createSign('RSA-SHA256');
    signer.update(signInput);
    signer.end();
    const signature = base64url(signer.sign(account.private_key));
    const assertion = `${signInput}.${signature}`;

    const response = await fetch(account.token_uri || TOKEN_URI, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(PUSH_SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error('[fcm] token exchange failed', response.status, await response.text().catch(() => ''));
      return null;
    }

    const json = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;

    cachedToken = {
      accessToken: json.access_token,
      expiresAtMs: now + (json.expires_in || 3600) * 1000,
    };
    return cachedToken.accessToken;
  } catch (error) {
    console.error('[fcm] failed to obtain access token', error);
    return null;
  }
}

type DeviceTokenRow = { id: string; user_id: string; token: string };

/**
 * Sends payload to every given FCM device token. Prunes tokens FCM reports
 * as gone. Never throws — a native-push failure must never break a task
 * flow, broadcast, or drip send that also targets Web Push subscriptions.
 */
export async function sendFcmToTokens(
  adminClient: SupabaseClient,
  rows: DeviceTokenRow[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  const account = loadServiceAccount();
  if (!account || rows.length === 0) {
    return { sent: 0, pruned: 0 };
  }

  const accessToken = await getAccessToken(account);
  if (!accessToken) {
    return { sent: 0, pruned: 0 };
  }

  const endpoint = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;
  let sent = 0;
  const staleTokens: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildFcmMessage(row.token, payload)),
          signal: AbortSignal.timeout(PUSH_SEND_TIMEOUT_MS),
        });

        if (response.ok) {
          sent += 1;
          return;
        }

        const errorBody = await response.json().catch(() => null);
        if (classifyFcmError(response.status, errorBody) === 'prune') {
          staleTokens.push(row.token);
        } else {
          console.error('[fcm] send failed', response.status, errorBody);
        }
      } catch (error) {
        console.error('[fcm] send failed', error instanceof Error ? error.message : error);
      }
    })
  );

  if (staleTokens.length > 0) {
    await adminClient.from(DEVICE_PUSH_TOKENS_TABLE).delete().in('token', staleTokens);
  }

  return { sent, pruned: staleTokens.length };
}
