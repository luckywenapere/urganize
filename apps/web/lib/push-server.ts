// SERVER ONLY — imports web-push (Node crypto). Only import from route
// handlers / server modules (tasks-server.ts, cron), never from 'use client'
// code; the browser half is lib/push.ts.
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendFcmToTokens, isFcmConfigured, DEVICE_PUSH_TOKENS_TABLE } from '@/lib/fcm-server';
import { PUSH_SEND_TIMEOUT_MS } from '@/lib/push-limits';

// Server half of the push wiring. The ONLY place pushes are sent from — the
// payload shape here is the contract public/sw.js renders, and the contract
// buildFcmMessage (lib/fcm.ts) maps onto for native devices.
//
// Two transports fan out from here: Web Push (this file's original job —
// browsers and installed PWAs) and FCM (lib/fcm-server.ts — the Expo
// native shell, which has no PushManager and so cannot use Web Push at all).
// Every caller (task notifications, the engagement drip, admin broadcast)
// goes through sendPushToUsers/sendPushToAllUsers and gets both transports
// for free; nothing above this file needs to know which devices a user has.
//
// Env (see .env.example):
//   NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY — also used by the browser to
//     subscribe; the pair identifies this app to the push services.
//   WEB_PUSH_VAPID_PRIVATE_KEY — server-only signing key.
//   WEB_PUSH_CONTACT — mailto: or https: contact for push-service operators.
//   FCM_SERVICE_ACCOUNT_JSON — server-only, see lib/fcm-server.ts.
// Generate a Web Push key pair once with `npx web-push generate-vapid-keys`.
//
// Degrades to a no-op when neither transport is configured — task flows
// never fail because push isn't set up.

export const PUSH_SUBSCRIPTIONS_TABLE = 'push_subscriptions';

export type PushPayload = {
  title: string;
  body: string;
  /** In-app path the notification click opens; defaults to /dashboard. */
  url?: string;
  /** Collapse key — a newer notification with the same tag replaces the
   * older one instead of stacking. */
  tag?: string;
};

let configured: boolean | null = null;

function ensureConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const contact = process.env.WEB_PUSH_CONTACT?.trim() || 'mailto:contact@urganize.app';
  if (!publicKey || !privateKey) {
    configured = false;
    return configured;
  }
  webpush.setVapidDetails(contact, publicKey, privateKey);
  configured = true;
  return configured;
}

export function isWebPushConfigured(): boolean {
  return ensureConfigured();
}

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function sendToWebPushSubscriptions(
  adminClient: SupabaseClient,
  rows: SubscriptionRow[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured() || rows.length === 0) {
    return { sent: 0, pruned: 0 };
  }

  const body = JSON.stringify(payload);
  let sent = 0;
  const goneEndpoints: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
          // A push service that stops answering must not hold a request or a
          // cron run open (lib/push-limits.ts).
          { TTL: 60 * 60 * 24, timeout: PUSH_SEND_TIMEOUT_MS }
        );
        sent += 1;
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        // 404/410 mean the subscription is dead (browser revoked it, PWA
        // uninstalled). Prune so we stop paying for it on every send.
        if (statusCode === 404 || statusCode === 410) {
          goneEndpoints.push(row.endpoint);
        } else {
          console.error('[push] send failed', statusCode, error instanceof Error ? error.message : error);
        }
      }
    })
  );

  if (goneEndpoints.length > 0) {
    await adminClient
      .from(PUSH_SUBSCRIPTIONS_TABLE)
      .delete()
      .in('endpoint', goneEndpoints);
  }

  return { sent, pruned: goneEndpoints.length };
}

type DeviceTokenRow = { id: string; user_id: string; token: string };

function sumResults(
  results: Array<{ sent: number; pruned: number }>
): { sent: number; pruned: number } {
  return results.reduce(
    (total, result) => ({ sent: total.sent + result.sent, pruned: total.pruned + result.pruned }),
    { sent: 0, pruned: 0 }
  );
}

/** Push to every registered device of the given users, across both
 * transports (Web Push subscriptions + native FCM tokens). Never throws. */
export async function sendPushToUsers(
  adminClient: SupabaseClient,
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  const webPushOn = ensureConfigured();
  const fcmOn = isFcmConfigured();
  if ((!webPushOn && !fcmOn) || userIds.length === 0) {
    return { sent: 0, pruned: 0 };
  }

  try {
    const [webPushResult, fcmResult] = await Promise.all([
      webPushOn ? fetchAndSendWebPush(adminClient, payload, userIds) : NO_RESULT,
      fcmOn ? fetchAndSendFcm(adminClient, payload, userIds) : NO_RESULT,
    ]);
    return sumResults([webPushResult, fcmResult]);
  } catch (error) {
    console.error('[push] sendPushToUsers failed', error);
    return { sent: 0, pruned: 0 };
  }
}

/** Broadcast to every registered device across all users, across both
 * transports. This is the primitive the admin broadcast dashboard calls —
 * deliberately built as a single choke point so native reach is a
 * plumbing-layer change, not a per-feature one. Never throws. */
export async function sendPushToAllUsers(
  adminClient: SupabaseClient,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  const webPushOn = ensureConfigured();
  const fcmOn = isFcmConfigured();
  if (!webPushOn && !fcmOn) {
    return { sent: 0, pruned: 0 };
  }

  try {
    const [webPushResult, fcmResult] = await Promise.all([
      webPushOn ? fetchAndSendWebPush(adminClient, payload) : NO_RESULT,
      fcmOn ? fetchAndSendFcm(adminClient, payload) : NO_RESULT,
    ]);
    return sumResults([webPushResult, fcmResult]);
  } catch (error) {
    console.error('[push] sendPushToAllUsers failed', error);
    return { sent: 0, pruned: 0 };
  }
}

const NO_RESULT = Promise.resolve({ sent: 0, pruned: 0 });

async function fetchAndSendWebPush(
  adminClient: SupabaseClient,
  payload: PushPayload,
  userIds?: string[]
): Promise<{ sent: number; pruned: number }> {
  const base = adminClient.from(PUSH_SUBSCRIPTIONS_TABLE).select('id,user_id,endpoint,p256dh,auth');
  const { data, error } = await (userIds ? base.in('user_id', userIds) : base);
  if (error || !Array.isArray(data)) return { sent: 0, pruned: 0 };
  return await sendToWebPushSubscriptions(adminClient, data as SubscriptionRow[], payload);
}

async function fetchAndSendFcm(
  adminClient: SupabaseClient,
  payload: PushPayload,
  userIds?: string[]
): Promise<{ sent: number; pruned: number }> {
  const base = adminClient.from(DEVICE_PUSH_TOKENS_TABLE).select('id,user_id,token');
  const { data, error } = await (userIds ? base.in('user_id', userIds) : base);
  if (error || !Array.isArray(data)) return { sent: 0, pruned: 0 };
  return await sendFcmToTokens(adminClient, data as DeviceTokenRow[], payload);
}
