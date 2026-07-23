// SERVER ONLY — imports web-push (Node crypto). Only import from route
// handlers / server modules (tasks-server.ts, cron), never from 'use client'
// code; the browser half is lib/push.ts.
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

// Server half of the Web Push wiring. The ONLY place pushes are sent from —
// the payload shape here is the contract public/sw.js renders.
//
// Env (see .env.example):
//   NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY — also used by the browser to
//     subscribe; the pair identifies this app to the push services.
//   WEB_PUSH_VAPID_PRIVATE_KEY — server-only signing key.
//   WEB_PUSH_CONTACT — mailto: or https: contact for push-service operators.
// Generate a key pair once with `npx web-push generate-vapid-keys`.
//
// Degrades to a no-op when the keys aren't configured — task flows never
// fail because push isn't set up.

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

async function sendToSubscriptions(
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
          { TTL: 60 * 60 * 24 }
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

/** Push to every registered device of the given users. Never throws. */
export async function sendPushToUsers(
  adminClient: SupabaseClient,
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured() || userIds.length === 0) {
    return { sent: 0, pruned: 0 };
  }

  try {
    const { data, error } = await adminClient
      .from(PUSH_SUBSCRIPTIONS_TABLE)
      .select('id,user_id,endpoint,p256dh,auth')
      .in('user_id', userIds);
    if (error || !Array.isArray(data)) {
      return { sent: 0, pruned: 0 };
    }
    return await sendToSubscriptions(adminClient, data as SubscriptionRow[], payload);
  } catch (error) {
    console.error('[push] sendPushToUsers failed', error);
    return { sent: 0, pruned: 0 };
  }
}

/** Broadcast to every registered device across all users. This is the
 * primitive the future "send periodic notifications to all users" admin
 * dashboard will call — deliberately built now so that surface is a UI
 * task, not a plumbing one. Never throws. */
export async function sendPushToAllUsers(
  adminClient: SupabaseClient,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) {
    return { sent: 0, pruned: 0 };
  }

  try {
    const { data, error } = await adminClient
      .from(PUSH_SUBSCRIPTIONS_TABLE)
      .select('id,user_id,endpoint,p256dh,auth');
    if (error || !Array.isArray(data)) {
      return { sent: 0, pruned: 0 };
    }
    return await sendToSubscriptions(adminClient, data as SubscriptionRow[], payload);
  } catch (error) {
    console.error('[push] sendPushToAllUsers failed', error);
    return { sent: 0, pruned: 0 };
  }
}
