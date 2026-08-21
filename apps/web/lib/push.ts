'use client';

// Browser-side Web Push wiring: service-worker registration, permission +
// subscription flow, and syncing the subscription to the server. The server
// half lives in lib/push-server.ts; the two share the payload contract
// documented in public/sw.js.

import { supabase } from '@/lib/supabase/client';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || '';

export type PushStatus =
  | 'unsupported' // browser has no SW/Push/Notification APIs (or key unset)
  | 'blocked' // the user denied the permission at the browser level
  | 'enabled' // permission granted AND a live subscription exists
  | 'disabled'; // supported but not (yet) subscribed on this device

/** The raw browser permission, narrowed to the three states that matter.
 * Distinct from PushStatus on purpose: status answers "is this device
 * receiving pushes", this answers "are we still ALLOWED to ask" — and only
 * 'default' means yes. lib/push-prompt.ts turns the pair into a decision. */
export type PushPermissionState = 'default' | 'granted' | 'denied';

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

/** Reads Notification.permission without prompting. Returns 'denied' when
 * the API is absent so callers can treat "cannot ask" uniformly — the
 * unsupported case is already caught by isPushSupported/getPushStatus before
 * this value is ever consulted. */
export function getNotificationPermission(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  const permission = Notification.permission;
  return permission === 'granted' || permission === 'denied' ? permission : 'default';
}

/** Registers the service worker. Safe to call on every app load — no
 * permission prompt is involved in registration itself. */
export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

// The PushManager wants the VAPID public key as a Uint8Array, but it ships
// around as a base64url string. Standard conversion.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const registration = await navigator.serviceWorker.getRegistration('/sw.js');
    const subscription = await registration?.pushManager.getSubscription();
    return subscription && Notification.permission === 'granted' ? 'enabled' : 'disabled';
  } catch {
    return 'disabled';
  }
}

/** Full enable flow: permission prompt → subscribe → sync to server.
 * Returns the resulting status ('enabled' on success). */
export async function enablePush(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'disabled';

  const registration =
    (await navigator.serviceWorker.getRegistration('/sw.js')) ||
    (await registerPushServiceWorker());
  if (!registration) return 'disabled';
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    }));

  const token = await getAccessToken();
  if (!token) throw new Error('Session expired. Please sign in again.');

  const payload = subscription.toJSON();
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: payload.endpoint,
      keys: payload.keys,
      userAgent: navigator.userAgent,
    }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'Could not save the notification subscription.');
  }

  return 'enabled';
}

/** Unsubscribes this device and removes the server-side row. */
export async function disablePush(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported';
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return 'disabled';

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => {});

  const token = await getAccessToken();
  if (token) {
    await fetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint }),
    }).catch(() => {});
  }

  return 'disabled';
}
