'use client';

import { useEffect, useState } from 'react';
import { BellRing } from '@/components/icons';
import { captureAnalyticsEvent } from '@/lib/analytics/client';
import { getNotificationPermission, isPushSupported, enablePush } from '@/lib/push';
import { enableNativePush, getNativePushPermission, isNativePushAvailable } from '@/lib/native-push';
import { request as nativeRequest } from '@/lib/native-bridge';
import {
  DEFAULT_OPT_IN_CHOICES,
  markPushAskedInOnboarding,
  readOptInChoices,
  saveMarketingEmailConsent,
  saveOptInChoices,
  type OnboardingOptInChoices,
} from '@/lib/onboarding-optin';

const NATIVE_PUSH_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NATIVE_PUSH === 'true';

/**
 * "Stay on top of your next move" (URG-251 Part 2). Two toggles, both OFF by
 * default. The push permission prompt opens only from a tap on the push
 * toggle, never on load: a browser grants one prompt per origin, forever.
 *
 * Anonymous mode (the normal path): the tap asks the OS for permission and the
 * choice is held in localStorage; the subscription and the email choice are
 * attached once the account exists (lib/onboarding-optin.ts). In the native
 * app the tap goes through the shell's bridge, not Web Push.
 *
 * Authed mode (?setup=1): the account already exists, so a tap saves directly.
 */
export function OnboardingOptInStep({
  authed,
  getToken,
}: {
  authed: boolean;
  getToken: () => Promise<string>;
}) {
  const [choices, setChoices] = useState<OnboardingOptInChoices>(DEFAULT_OPT_IN_CHOICES);
  const [pushAvailable, setPushAvailable] = useState(true);
  const [pushNote, setPushNote] = useState('');
  const [working, setWorking] = useState(false);

  const native = NATIVE_PUSH_ENABLED && isNativePushAvailable();

  useEffect(() => {
    // A choice made before a Google round trip comes back as it was.
    const stored = readOptInChoices();
    if (stored) setChoices(stored);
    else saveOptInChoices(DEFAULT_OPT_IN_CHOICES);
    setPushAvailable(native || isPushSupported());
    // Shown: the in-app soft ask stays away from now on, on this device.
    markPushAskedInOnboarding();
    captureAnalyticsEvent({ name: 'onboarding_optin_viewed', properties: {} });
  }, [native]);

  const update = (next: OnboardingOptInChoices) => {
    setChoices(next);
    saveOptInChoices(next);
  };

  const togglePush = async () => {
    if (working) return;
    setPushNote('');
    if (choices.push) {
      update({ ...choices, push: false });
      captureAnalyticsEvent({ name: 'onboarding_optin_toggled', properties: { channel: 'push', on: false } });
      return;
    }
    if (!pushAvailable) {
      setPushNote('Notifications are not available in this browser. You can turn them on in the app.');
      captureAnalyticsEvent({
        name: 'onboarding_optin_toggled',
        properties: { channel: 'push', on: true, result: 'unsupported' },
      });
      return;
    }
    setWorking(true);
    let permission: 'default' | 'granted' | 'denied' = 'default';
    try {
      if (authed) {
        // Signed in already: the full enable flow, prompt included (this tap is the gesture).
        const status = native ? await enableNativePush() : await enablePush();
        permission = status === 'enabled' ? 'granted' : status === 'blocked' ? 'denied' : 'default';
      } else if (native) {
        const current = await getNativePushPermission();
        permission =
          current === 'default'
            ? (await nativeRequest('push.request', {}, { timeoutMs: 120_000 })).permission
            : current;
      } else {
        const current = getNotificationPermission();
        permission = current === 'default' ? await Notification.requestPermission().then(normalize) : current;
      }
    } catch {
      permission = 'default';
    } finally {
      setWorking(false);
    }
    captureAnalyticsEvent({
      name: 'onboarding_optin_toggled',
      properties: { channel: 'push', on: permission === 'granted', result: permission },
    });
    if (permission === 'granted') {
      update({ ...choices, push: true });
    } else if (permission === 'denied') {
      setPushNote(
        native
          ? 'Notifications are off for Urganize in your phone settings.'
          : 'Notifications are blocked for this site in your browser settings.'
      );
    }
  };

  const toggleEmail = async () => {
    const next = { ...choices, email: !choices.email };
    update(next);
    captureAnalyticsEvent({ name: 'onboarding_optin_toggled', properties: { channel: 'email', on: next.email } });
    if (authed) {
      const token = await getToken().catch(() => '');
      if (token) void saveMarketingEmailConsent(token, next.email);
    }
  };

  return (
    <div className="mt-5 space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand/12 text-brand">
          <BellRing className="h-6 w-6" aria-hidden="true" />
        </span>
        <p className="text-sm leading-relaxed text-content-secondary">We&apos;ll let you know when:</p>
      </div>
      <ul className="space-y-1.5 text-sm text-content-secondary">
        <li>· An activity is due</li>
        <li>· A curator answers your pitch</li>
        <li>· It&apos;s time for your next step</li>
        <li>· A monthly digest with tips and offers (email only)</li>
      </ul>

      <div className="space-y-2">
        <OptInToggle
          label="Push notifications"
          checked={choices.push}
          disabled={working}
          onToggle={() => void togglePush()}
        />
        {pushNote ? <p className="px-1 text-xs text-content-tertiary">{pushNote}</p> : null}
        <OptInToggle label="Email updates" checked={choices.email} onToggle={() => void toggleEmail()} />
      </div>
      <p className="text-xs text-content-tertiary">Both stay off unless you turn them on.</p>
    </div>
  );
}

function normalize(permission: NotificationPermission): 'default' | 'granted' | 'denied' {
  return permission === 'granted' || permission === 'denied' ? permission : 'default';
}

function OptInToggle({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={`motion-focus flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border bg-bg-elevated px-4 py-3 text-left text-sm text-content-primary transition-colors duration-fast ease-standard disabled:opacity-60 ${
        checked ? 'border-brand bg-brand/8' : 'border-stroke-default hover:border-stroke-strong'
      }`}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-fast ${
          checked ? 'bg-brand' : 'bg-stroke-strong'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-fast ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
