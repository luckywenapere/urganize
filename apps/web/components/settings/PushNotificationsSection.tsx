'use client';

import { useEffect, useState } from 'react';
import { BellRing } from '@/components/icons';
import { errorMessage } from '@/lib/errors';
import {
  disablePush,
  enablePush,
  getPushStatus,
  isPushSupported,
  type PushStatus,
} from '@/lib/push';
import {
  disableNativePush,
  enableNativePush,
  getNativePushStatus,
  isNativePushAvailable,
} from '@/lib/native-push';
import { SettingRow, settingRowButtonClass } from './SettingRow';

// Real push notifications (2026-07-23) — replaces the placebo prefs section
// removed earlier the same day. Per-device: enabling here registers THIS
// browser/PWA for pushes (task assigned to you, task due, status changes).
//
// Native push (2026-08-10) reuses this exact row rather than a second one: a
// browser can do Web Push OR the app can do native push, never both on the
// same device, so exactly one status/toggle pair is ever relevant.
//
// Became a ROW inside NotificationsSettingsSection (2026-08-13) — it was a
// standalone section paired two-up with Appearance, which put the app's push
// switch nowhere near the two other notification toggles.

const NATIVE_PUSH_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NATIVE_PUSH === 'true';

const STATUS_COPY: Record<PushStatus, string> = {
  unsupported: 'This browser does not support push notifications.',
  blocked:
    'Notifications are blocked for this site at the browser level. Allow them in your browser settings, then try again.',
  // Enabled state carries no description (founder call, 2026-07-23) — the
  // lit icon + the "Turn off" button say everything.
  enabled: '',
  disabled: 'Turn on notifications to hear about activity assignments, due dates, and status changes on this device.',
};

const NATIVE_STATUS_COPY: Record<PushStatus, string> = {
  unsupported: 'This device does not support push notifications.',
  blocked:
    'Notifications are turned off for Urganize at the system level. Enable them in your phone’s settings, then try again.',
  enabled: '',
  disabled: 'Turn on notifications to hear about activity assignments, due dates, and status changes on this device.',
};

export function PushNotificationsSection() {
  const native = NATIVE_PUSH_ENABLED && isNativePushAvailable();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const probe = native ? getNativePushStatus() : getPushStatus();
    void probe.then((resolved) => {
      if (!cancelled) setStatus(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [native]);

  // Renders nothing until the status probe resolves so there's no flash of
  // the wrong state. Since 2026-10-17 this is the only row in the
  // Notifications tab, so a device that can't do push gets the one-line
  // "not supported" note with no button, instead of an empty tab.
  if (status === null) return null;
  const unsupported = !native && !isPushSupported();

  const handleToggle = async () => {
    setError('');
    setIsWorking(true);
    try {
      const next = native
        ? status === 'enabled'
          ? await disableNativePush()
          : await enableNativePush()
        : status === 'enabled'
          ? await disablePush()
          : await enablePush();
      setStatus(next);
    } catch (err) {
      setError(errorMessage(err, 'Could not update notifications.'));
      setStatus(await (native ? getNativePushStatus() : getPushStatus()));
    } finally {
      setIsWorking(false);
    }
  };

  const copy = native ? NATIVE_STATUS_COPY : STATUS_COPY;
  const shownStatus: PushStatus = unsupported ? 'unsupported' : status;
  const isEnabled = shownStatus === 'enabled';

  return (
    <SettingRow
      icon={
        <BellRing
          className={`h-4 w-4 ${isEnabled ? 'text-brand' : 'text-content-tertiary'}`}
          aria-hidden="true"
        />
      }
      title="Push notifications"
      description={copy[shownStatus] || 'On for this device.'}
      action={
        shownStatus !== 'blocked' && shownStatus !== 'unsupported' ? (
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={isWorking}
            className={settingRowButtonClass(isEnabled)}
          >
            {isWorking ? 'Working…' : isEnabled ? 'Turn off on this device' : 'Turn on'}
          </button>
        ) : null
      }
      error={error}
    />
  );
}
