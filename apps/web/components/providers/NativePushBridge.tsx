'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isSameOriginPath } from '@urganize/native-bridge';
import { subscribe, whenInShell } from '@/lib/native-bridge';
import {
  getNativePushPermission,
  isNativePushAvailable,
  registerNativePushToken,
  syncNativePushToken,
} from '@/lib/native-push';

const NATIVE_PUSH_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NATIVE_PUSH === 'true';

/**
 * Native-only, mounted app-wide (see AppShell). Passive on purpose — it never
 * prompts for permission; that only happens when the user taps "Enable
 * notifications" (PushNotificationsSection / PushPermissionPrompt), the same
 * split lib/push.ts uses for Web Push. Three jobs:
 *
 *  1. If the OS permission is already granted (a returning user), silently
 *     re-register — FCM tokens rotate, and this keeps the server row fresh.
 *  2. When the shell reports a rotated token on its own, sync it.
 *  3. When a notification is tapped, deep-link into the app, mirroring the
 *     service worker's notificationclick handler for Web Push. Only same-origin
 *     paths are followed.
 *
 * The tap subscription is NOT gated on the feature flag: a notification that
 * reached the phone should always open where it points.
 *
 * It starts through whenInShell rather than on mount alone. Android injects
 * the shell's description as the page starts loading, not strictly before its
 * first script, and subscribing is also what tells the shell the page is ready
 * for the notification that opened the app — so missing that window would
 * lose the tap that launched it.
 */
export function NativePushBridge() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const removers: Array<() => void> = [];

    const start = () => {
      removers.push(
        subscribe('pushTap', ({ url }) => {
          if (isSameOriginPath(url)) router.push(url);
        })
      );

      if (!NATIVE_PUSH_ENABLED || !isNativePushAvailable()) return;

      removers.push(
        subscribe('pushToken', ({ token }) => {
          if (typeof token === 'string' && token) void syncNativePushToken(token);
        })
      );

      void (async () => {
        const permission = await getNativePushPermission();
        if (cancelled || permission !== 'granted') return;
        const token = await registerNativePushToken();
        if (!cancelled && token) await syncNativePushToken(token);
      })();
    };

    const stopWaiting = whenInShell(start);

    return () => {
      cancelled = true;
      stopWaiting();
      removers.forEach((remove) => remove());
    };
  }, [router]);

  return null;
}
