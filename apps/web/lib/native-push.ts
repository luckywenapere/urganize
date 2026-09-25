'use client';

// Browser-side wiring for NATIVE push — the counterpart to lib/push.ts, which
// covers Web Push for browsers/installed PWAs. The two are separate transports
// because an app webview has no PushManager at all; the server fans out to
// both from one choke point (lib/push-server.ts).
//
// The Expo shell (apps/mobile) owns the OS permission and the token, and this
// module asks it for them over lib/native-bridge.ts. The token is an FCM token
// on BOTH platforms (the shell uses React Native Firebase on iOS too), because
// the server only sends through FCM HTTP v1 (lib/fcm-server.ts).
//
// A device's FCM/APNs token has no long-lived client-side handle the way a
// Web Push PushSubscription object does (nothing like
// `registration.pushManager.getSubscription()` exists for native), so this
// module keeps the last-registered token in localStorage via
// lib/persisted-state.ts — that's what "disable" reads back to know which
// server-side row to delete.

import { getPlatform } from '@/lib/platform';
import { request, shellSupports } from '@/lib/native-bridge';
import { supabase } from '@/lib/supabase/client';
import { clearPersistedState, readPersistedState, writePersistedState } from '@/lib/persisted-state';
import type { PushPermissionState } from '@/lib/push';

const TOKEN_STORAGE_KEY = 'urganize.native-push.token';
const TOKEN_STORAGE_VERSION = 1;

export type NativePushPlatform = 'android' | 'ios';

export type NativePushStatus =
  | 'unsupported' // not a native shell, or this shell build has no push
  | 'blocked' // the user denied the OS-level permission
  | 'enabled' // permission granted AND this device has a registered token
  | 'disabled'; // supported but not (yet) registered on this device

const isStringValue = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function getStoredToken(): string | null {
  return readPersistedState(TOKEN_STORAGE_KEY, TOKEN_STORAGE_VERSION, isStringValue);
}

function storeToken(token: string): void {
  writePersistedState(TOKEN_STORAGE_KEY, TOKEN_STORAGE_VERSION, token);
}

function clearStoredToken(): void {
  clearPersistedState(TOKEN_STORAGE_KEY);
}

export function isNativePushAvailable(): boolean {
  return shellSupports('push.register') && shellSupports('push.permission');
}

function toPlatform(): NativePushPlatform | null {
  const platform = getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : null;
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || '';
}

/** Posts a freshly (re-)registered token to the server. Safe to call
 * repeatedly — the route upserts on token conflict. Never throws. */
export async function syncNativePushToken(token: string): Promise<void> {
  const platform = toPlatform();
  if (!platform) return;
  const accessToken = await getAccessToken();
  if (!accessToken) return;

  try {
    const response = await fetch('/api/push/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token, platform }),
    });
    if (response.ok) storeToken(token);
  } catch {
    // Best-effort — never let push registration break app load.
  }
}

async function unregisterToken(token: string): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) return;
  await fetch('/api/push/token', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ token }),
  }).catch(() => {});
}

/** Native counterpart to lib/push.ts's getNotificationPermission. The shell
 * already collapses every "not asked yet" flavour to 'default', because each
 * means the OS will still show a prompt if we request one. */
export async function getNativePushPermission(): Promise<PushPermissionState> {
  if (!isNativePushAvailable()) return 'denied';
  try {
    const { permission } = await request('push.permission', {});
    return permission;
  } catch {
    return 'denied';
  }
}

export async function getNativePushStatus(): Promise<NativePushStatus> {
  if (!isNativePushAvailable()) return 'unsupported';
  try {
    const { permission } = await request('push.permission', {});
    if (permission === 'denied') return 'blocked';
    if (permission === 'granted' && getStoredToken()) return 'enabled';
    return 'disabled';
  } catch {
    return 'disabled';
  }
}

/** Asks the shell for this device's token. The 8 second ceiling is the same
 * one the earlier shell used: FCM usually answers in well under a second,
 * and a request that has not answered by then is not going to. */
export async function registerNativePushToken(): Promise<string | null> {
  try {
    const { token } = await request('push.register', {}, { timeoutMs: 8000 });
    return token || null;
  } catch (error) {
    console.error('[push] native registration failed', error);
    return null;
  }
}

/** Full enable flow: permission prompt → register → sync token to server.
 * Returns the resulting status ('enabled' on success). */
export async function enableNativePush(): Promise<NativePushStatus> {
  if (!isNativePushAvailable()) return 'unsupported';

  let permission: PushPermissionState;
  try {
    ({ permission } = await request('push.permission', {}));
    if (permission === 'default') {
      // The OS prompt waits on a person, so no short timeout here.
      ({ permission } = await request('push.request', {}, { timeoutMs: 120_000 }));
    }
  } catch {
    return 'disabled';
  }
  if (permission === 'denied') return 'blocked';
  if (permission !== 'granted') return 'disabled';

  const token = await registerNativePushToken();
  if (!token) return 'disabled';
  await syncNativePushToken(token);
  return 'enabled';
}

/** Removes this device's server-side registration. Cannot revoke the OS
 * permission itself — the caller's copy should point the user at their
 * phone's own notification settings for that. */
export async function disableNativePush(): Promise<NativePushStatus> {
  if (!isNativePushAvailable()) return 'unsupported';
  const token = getStoredToken();
  if (token) await unregisterToken(token);
  clearStoredToken();
  return 'disabled';
}
