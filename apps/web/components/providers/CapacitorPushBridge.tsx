'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isNativePushAvailable, syncNativePushToken } from '@/lib/native-push';

const NATIVE_PUSH_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NATIVE_PUSH === 'true';

/**
 * Native-only, mounted app-wide (see AppShell). Two jobs, both passive — this
 * component never prompts for permission; that only happens when the user
 * explicitly taps "Enable notifications" in Settings
 * (components/settings/PushNotificationsSection.tsx's native variant), the
 * same shape lib/push.ts already uses for Web Push (registerPushServiceWorker
 * here vs enablePush there):
 *
 *  1. If the OS permission is already granted (a returning user who enabled
 *     push before), silently re-register — FCM/APNs tokens can rotate, and
 *     this keeps the server-side row fresh without a second prompt.
 *  2. Listen for a tapped notification and deep-link into the app, mirroring
 *     public/sw.js's notificationclick handler for Web Push.
 */
export function CapacitorPushBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!NATIVE_PUSH_ENABLED) return;
    if (!isNativePushAvailable()) return;

    let cancelled = false;
    const removers: Array<() => void> = [];

    void (async () => {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      if (cancelled) return;

      const registrationListener = await PushNotifications.addListener('registration', (result) => {
        void syncNativePushToken(result.value);
      });
      removers.push(() => void registrationListener.remove());

      const errorListener = await PushNotifications.addListener('registrationError', (error) => {
        console.error('[push] native registration failed', error);
      });
      removers.push(() => void errorListener.remove());

      const actionListener = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action) => {
          const url = (action.notification.data as { url?: string } | undefined)?.url;
          if (typeof url === 'string' && url.startsWith('/')) {
            router.push(url);
          }
        }
      );
      removers.push(() => void actionListener.remove());

      const permission = await PushNotifications.checkPermissions();
      if (!cancelled && permission.receive === 'granted') {
        await PushNotifications.register();
      }
    })();

    return () => {
      cancelled = true;
      removers.forEach((remove) => remove());
    };
  }, [router]);

  return null;
}
