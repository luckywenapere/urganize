'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellRing, X } from '@/components/icons';
import { useAuthStore } from '@/lib/auth-store';
import { useToast } from '@/components/shared/ToastProvider';
import { errorMessage } from '@/lib/errors';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';
import {
  enablePush,
  getNotificationPermission,
  getPushStatus,
  isPushSupported,
  type PushPermissionState,
  type PushStatus,
} from '@/lib/push';
import {
  enableNativePush,
  getNativePushPermission,
  getNativePushStatus,
  isNativePushAvailable,
} from '@/lib/native-push';
import {
  decidePushPrompt,
  PUSH_PROMPT_SNOOZE_MS,
  PUSH_PROMPT_SNOOZE_VERSION,
  pushPromptSnoozeKey,
} from '@/lib/push-prompt';
import { isInstallPromptOwed, subscribeInstallPromptSettled } from '@/lib/install-prompt';

const NATIVE_PUSH_ENABLED = process.env.NEXT_PUBLIC_FEATURE_NATIVE_PUSH === 'true';
const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';
const INSTALL_PROMPT_ENABLED = process.env.NEXT_PUBLIC_FEATURE_INSTALL_PROMPT === 'true';

/** Let the app settle before asking. A permission card that lands in the same
 * frame as the dashboard reads as a toll gate. Not a fix for the overlap with
 * the other first-login surface (WhatsNewModal) — the z-tier below is that —
 * just good manners. */
const ASK_DELAY_MS = 6000;

/** Shorter than ASK_DELAY_MS on purpose: this one follows a card the user
 * just dismissed, so it is a continuation rather than an arrival, and six
 * seconds of nothing would read as the dismissal having done something. Long
 * enough that the two cards do not appear to swap in the same frame. */
const INSTALL_HANDOFF_DELAY_MS = 900;

const isTrue = (value: unknown): value is true => value === true;

/** GHOST, not an outlined box. This card's ground is already bg-bg-surface,
 * and in light mode bg-bg-surface and bg-bg-elevated resolve to the same cream
 * — measured a luminance delta of 0 against the panel — so a filled secondary
 * button here is defined by nothing but a 6%-opacity border. Same token
 * collision CLAUDE.md records for the Settings billing section. Dismissing
 * should not compete with the primary action anyway.
 *
 * border-transparent is load-bearing, not decoration: without it this button
 * and the filled one beside it measured 38px vs 36px, because only one of them
 * carried a border. */
const dismissButtonClass =
  'motion-focus motion-press rounded-lg border border-transparent px-4 py-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-60';

/**
 * The soft ask that finally puts the Settings push toggle in front of people
 * (2026-08-21). Flag: NEXT_PUBLIC_FEATURE_PUSH_PROMPT.
 *
 * THE PART THAT IS NOT NEGOTIABLE: this card's button is what calls
 * enablePush(). Browsers only honour Notification.requestPermission() from a
 * real user gesture (Safari enforces it outright, Chrome degrades to the
 * quiet UI without one), so the OS prompt CANNOT be opened from the effect
 * below, and must not be. Two steps by necessity as much as by taste: our
 * card explains, their tap asks. Refactoring this into "just prompt on load"
 * buys a silently suppressed prompt on some browsers and a permanently
 * blocked origin on others.
 *
 * A CARD, NOT A MODAL, for three reasons. It never blocks the app, so the
 * worst case for someone who does not care is one tap. It sits at z-[140],
 * above the ChappiDock panel (130) and the mobile nav (30) and below every
 * task and page modal (170+), so anything the user deliberately opens wins,
 * and WhatsNewModal (200, with a backdrop) simply covers it on a genuinely
 * first login then reveals it on dismissal, which is the sequencing we want
 * with no cross-component coupling. And an ask that hijacks the screen is the
 * exact pattern that trains people to hit Block.
 *
 * Mounted by AppShell alongside WhatsNewModal, so it inherits that gate:
 * authenticated, auth RESOLVED, and chrome-bearing routes only. A
 * curator-only account never reaches those routes and so never sees this —
 * every notification this product sends is about a release or a task.
 */
export function PushPermissionPrompt() {
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const { pushToast } = useToast();
  const [isVisible, setIsVisible] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');

  const native = NATIVE_PUSH_ENABLED && isNativePushAvailable();

  const snooze = useCallback(() => {
    if (!userId) return;
    writePersistedState(pushPromptSnoozeKey(userId), PUSH_PROMPT_SNOOZE_VERSION, true);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (!native && !isPushSupported()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const showAfter = (delayMs: number) => {
      timer = setTimeout(() => {
        if (!cancelled) setIsVisible(true);
      }, delayMs);
    };

    void (async () => {
      let status: PushStatus;
      let permission: PushPermissionState;
      try {
        [status, permission] = await Promise.all([
          native ? getNativePushStatus() : getPushStatus(),
          native ? getNativePushPermission() : Promise.resolve(getNotificationPermission()),
        ]);
      } catch {
        // Probing failed (restricted storage, a dead service worker). Staying
        // quiet is the only safe outcome — we cannot tell whether asking is
        // still allowed.
        return;
      }
      if (cancelled) return;

      const snoozed =
        readPersistedState(
          pushPromptSnoozeKey(userId),
          PUSH_PROMPT_SNOOZE_VERSION,
          isTrue,
          PUSH_PROMPT_SNOOZE_MS
        ) === true;

      const decision = decidePushPrompt({ status, permission, snoozed });

      if (decision === 'ask') {
        // SEQUENCING (founder request, 2026-08-30): where an install is on
        // offer, that card goes first and this one follows only if it is
        // turned down. Holding costs an ask in a visit the user leaves before
        // the install card's minute is up — and that is the right trade
        // rather than a regression, because a browser grants exactly one
        // permission prompt per origin, forever: spending it on someone who
        // opened one page and left is how an origin gets Blocked for good. On
        // iOS the order is not even a preference — Apple exposes Notification
        // only to Home Screen apps, so isPushSupported() is false in a Safari
        // tab and this effect has already returned above.
        if (INSTALL_PROMPT_ENABLED && isInstallPromptOwed()) {
          unsubscribe = subscribeInstallPromptSettled((outcome) => {
            unsubscribe?.();
            unsubscribe = undefined;
            if (cancelled || outcome !== 'declined') return;
            showAfter(INSTALL_HANDOFF_DELAY_MS);
          });
          return;
        }
        showAfter(ASK_DELAY_MS);
        return;
      }

      // Silent repair of a granted-but-unsubscribed device. Web only: on
      // native, NativePushBridge already re-registers a granted device on
      // every load, and a second call here would duplicate that work.
      if (decision === 'auto-enable' && !native) {
        try {
          await enablePush();
        } catch {
          // Best-effort. The user already said yes, so a failure leaves them
          // exactly where they were and the next load tries again.
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unsubscribe?.();
    };
  }, [native, userId]);

  const dismiss = () => {
    setIsVisible(false);
    snooze();
  };

  const handleEnable = async () => {
    setError('');
    setIsWorking(true);
    try {
      const next = native ? await enableNativePush() : await enablePush();
      // Every terminal answer closes the card and records the snooze,
      // 'disabled' included — that is what a dismissed OS prompt looks like,
      // and re-asking someone who just waved the browser dialog away is how
      // an origin gets blocked for good.
      setIsVisible(false);
      snooze();
      if (next === 'enabled') {
        pushToast('Notifications are on for this device.', 'success');
      } else if (next === 'blocked') {
        pushToast(
          native
            ? 'Notifications are off for Urganize in your phone settings.'
            : 'Notifications are blocked for this site in your browser settings.',
          'warning'
        );
      }
    } catch (err) {
      // The one case the card stays up: permission was granted but saving the
      // subscription failed, so a retry is genuinely useful and costs no
      // second prompt.
      setError(errorMessage(err, 'Could not turn on notifications.'));
    } finally {
      setIsWorking(false);
    }
  };

  if (!isVisible) return null;

  // Bottom-right, clearing whatever owns the bottom edge below lg: the mobile
  // nav bar is 4rem plus safe area when its flag is on, otherwise just the
  // safe area plus a gap. Both collapse to a plain inset at lg+, where
  // neither the bar nor the ChappiDock launcher renders.
  const bottomClass = MOBILE_NAV_ENABLED
    ? 'mobile-nav-raise-card lg:bottom-6'
    : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-6';

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="push-prompt-title"
      className={`fixed inset-x-4 z-[140] sm:left-auto sm:right-6 sm:w-[22rem] ${bottomClass}`}
    >
      <div className="rounded-2xl border border-stroke-default bg-bg-surface p-4 shadow-[0_24px_70px_-40px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))]">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/15"
            aria-hidden="true"
          >
            <BellRing className="h-4 w-4 text-brand" />
          </span>
          <div className="min-w-0 flex-1">
            <p id="push-prompt-title" className="text-sm font-semibold text-content-primary">
              Never miss a deadline
            </p>
            <p className="mt-1 text-sm leading-6 text-content-secondary">
              Turn on notifications and Urganize will tell you when an activity is due or a
              teammate hands you work.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss the notifications prompt"
            className="motion-focus motion-press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {error ? <p role="alert" className="mt-3 text-sm text-status-error">{error}</p> : null}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleEnable()}
            disabled={isWorking}
            className="motion-focus motion-press flex-1 rounded-lg border border-transparent bg-brand px-4 py-2 text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60"
          >
            {isWorking ? 'Turning on…' : error ? 'Try again' : 'Turn on notifications'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={isWorking}
            className={dismissButtonClass}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
