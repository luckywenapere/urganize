'use client';

// Browser-side wiring for NATIVE push (FCM on Android, APNs on iOS via the
// Capacitor shell in apps/mobile) — the counterpart to lib/push.ts, which
// covers Web Push for browsers/installed PWAs. The two are separate
// transports because a Capacitor webview has no PushManager at all; the
// server fans out to both from one choke point (lib/push-server.ts).
//
// A device's FCM/APNs token has no long-lived client-side handle the way a
// Web Push PushSubscription object does (nothing like
// `registration.pushManager.getSubscription()` exists for native), so this
// module keeps the last-registered token in localStorage via
// lib/persisted-state.ts — that's what "disable" reads back to know which
// server-side row to delete.

import { Capacitor } from '@capacitor/core';
import { isNativePlatform } from '@/lib/platform';
import { supabase } from '@/lib/supabase/client';
import { clearPersistedState, readPersistedState, writePersistedState } from '@/lib/persisted-state';
import type { PushPermissionState } from '@/lib/push';

const TOKEN_STORAGE_KEY = 'urganize.native-push.token';
const TOKEN_STORAGE_VERSION = 1;

export type NativePushPlatform = 'android' | 'ios';

export type NativePushStatus =
  | 'unsupported' // not a native shell, or the plugin isn't in this build
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
  return isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications');
}

function toPlatform(): NativePushPlatform | null {
  const platform = Capacitor.getPlatform();
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

/** Native counterpart to lib/push.ts's getNotificationPermission. Capacitor
 * reports two flavours of "not asked yet" ('prompt' and
 * 'prompt-with-rationale'); both collapse to 'default' because both mean the
 * OS will still show a prompt if we request one. */
export async function getNativePushPermission(): Promise<PushPermissionState> {
  if (!isNativePushAvailable()) return 'denied';
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'granted') return 'granted';
    if (permission.receive === 'denied') return 'denied';
    return 'default';
  } catch {
    return 'denied';
  }
}

export async function getNativePushStatus(): Promise<NativePushStatus> {
  if (!isNativePushAvailable()) return 'unsupported';
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'denied') return 'blocked';
    if (permission.receive === 'granted' && getStoredToken()) return 'enabled';
    return 'disabled';
  } catch {
    return 'disabled';
  }
}

/** Full enable flow: permission prompt → register → sync token to server.
 * Returns the resulting status ('enabled' on success). */
export async function enableNativePush(): Promise<NativePushStatus> {
  if (!isNativePushAvailable()) return 'unsupported';
  const { PushNotifications } = await import('@capacitor/push-notifications');

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive === 'denied') return 'blocked';
  if (permission.receive !== 'granted') return 'disabled';

  const token = await new Promise<string | null>((resolve) => {
    let settled = false;
    const settle = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    void PushNotifications.addListener('registration', (result) => settle(result.value));
    void PushNotifications.addListener('registrationError', () => settle(null));
    void PushNotifications.register();
    setTimeout(() => settle(null), 8000);
  });

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
