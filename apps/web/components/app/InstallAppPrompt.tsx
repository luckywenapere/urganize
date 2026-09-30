'use client';

import { useEffect, useState } from 'react';
import { MonitorDown, Share, Smartphone, X } from '@/components/icons';
import {
  INSTALL_PROMPT_DELAY_MS,
  armInstallPrompt,
  decideInstallPrompt,
  markInstallPromptShown,
  markInstallPromptSettled,
  promptDeferredInstall,
  readInstallPromptAccepted,
  readInstallPromptState,
  resolveDeviceInstallVariant,
  subscribeInstallAvailability,
  type InstallPromptOutcome,
  type InstallPromptVariant,
} from '@/lib/install-prompt';

const MOBILE_NAV_ENABLED = process.env.NEXT_PUBLIC_FEATURE_MOBILE_NAV === 'true';

/** The marketing site's /download page — the same destination
 * AndroidAppBanner uses, and the reason that banner stands down when this
 * prompt is switched on: one way in per platform, not two. Cross-domain
 * because the product app and the marketing site are separate Vercel
 * projects. */
const ANDROID_DOWNLOAD_URL = 'https://urganize.app/download';

/** Ghost, not an outlined box — PushPermissionPrompt's dismissButtonClass
 * verbatim, including why: bg-bg-surface and bg-bg-elevated resolve to the
 * same cream in light mode, so a filled secondary button here would be
 * defined by nothing but a 6%-opacity border, and border-transparent keeps
 * the two buttons the same height. */
const dismissButtonClass =
  'motion-focus motion-press rounded-lg border border-transparent px-4 py-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary disabled:opacity-60';

const primaryButtonClass =
  'motion-focus motion-press flex-1 rounded-lg border border-transparent bg-brand px-4 py-2 text-center text-sm font-semibold text-content-inverse hover:bg-brand-hover disabled:opacity-60';

const COPY: Record<
  Exclude<InstallPromptVariant, null>,
  { title: string; body: string; action: string }
> = {
  ios: {
    title: 'Keep Urganize on your Home Screen',
    body: 'It opens full screen, straight to your work. It is also the only way an iPhone will let us send you reminders.',
    // Not an action, and deliberately worded so it does not read as one. See
    // the iOS note in the component docblock.
    action: 'Close',
  },
  android: {
    title: 'Get the Urganize app',
    body: 'The app opens faster than the browser and can send you reminders when work is due.',
    action: 'Get the app',
  },
  desktop: {
    title: 'Install Urganize',
    body: 'It opens in its own window without the browser bar, and sits with your other apps.',
    action: 'Install',
  },
};

/**
 * "Put us on your Home Screen" — the install offer (founder request
 * 2026-08-30, retriggered and widened 2026-08-31). Flag:
 * NEXT_PUBLIC_FEATURE_INSTALL_PROMPT.
 *
 * Offered a minute into every visit, once per visit, on any device that has
 * an install to take. lib/install-prompt.ts holds the countdown, the
 * once-per-visit rule, the durable accept and the fail-closed storage rules —
 * including why the trigger stopped being behavioural on 2026-08-31.
 *
 * WHY THE THREE VARIANTS ARE THREE DIFFERENT THINGS, and why none of them can
 * be collapsed into the others:
 *
 *  - iOS can only ever be TAUGHT. There is no beforeinstallprompt on iOS and
 *    no API of any kind that opens Add to Home Screen: Apple routes it through
 *    the share sheet and nothing on the page can reach it. So the iOS card is
 *    instructions, and as of 2026-09-01 it carries NO primary button at all.
 *    It used to offer a filled "Got it", which is the first thing a thumb
 *    reaches for on a card whose buttons sit at the bottom — and tapping it
 *    dismissed the card, taking the two steps with it before the person had
 *    done anything. Reported from live use as "nothing happens when you click
 *    Got it", which was true in the sense that mattered. A filled button that
 *    cannot install is the failure PushPermissionPrompt's own header warns
 *    about for the permission dialog; one that also eats the instructions is
 *    worse. Do not put it back.
 *
 *    ITS ONE EXIT RECORDS A DECLINE, NOT AN ACCEPT, and that is the honest
 *    reading rather than a downgrade: nothing the page can observe tells us
 *    whether someone followed the steps, so claiming an accept would silence
 *    the offer for six months on a guess. A decline is session-scoped, so
 *    someone who read the steps and did not follow them is asked again next
 *    visit (the founder's "every visit"), while someone who DID follow them is
 *    closed out permanently by isStandaloneDisplay() — navigator.standalone is
 *    true from the Home Screen, so resolveDeviceInstallVariant() answers null
 *    and the card never renders again. Detection is the confirmation here, not
 *    a button.
 *
 *  - Android gets a LINK, not a web install. There is a real Android build
 *    (apps/mobile, distributed as an APK from the marketing site). Offering
 *    the browser's PWA install instead would put a second-best copy in front
 *    of someone who can have the actual app.
 *
 *  - Desktop is the only one the browser will actually do for us, and it is
 *    offered ONLY once beforeinstallprompt has genuinely arrived. A desktop
 *    Safari or Firefox visitor is shown nothing rather than a button that
 *    cannot work — the same rule as the iOS branch, reached from the other
 *    direction.
 *
 * SLOT SHARED WITH PushPermissionPrompt, deliberately: bottom of the screen
 * where a thumb reaches, clear of the mobile nav bar, z-[140] so anything the
 * user deliberately opens covers it. The two never overlap because the
 * notification ask waits for this one to be answered — see the install-owed
 * branch in PushPermissionPrompt.
 */
export function InstallAppPrompt() {
  const [variant, setVariant] = useState<InstallPromptVariant>(null);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fire = () => {
      timer = undefined;
      if (cancelled) return;
      // Re-read the device at fire time rather than trusting the value the
      // countdown started with: a desktop browser may have handed us its
      // install offer in the meantime, and an iOS visitor may have added us
      // to their Home Screen while the minute ran.
      const fireVariant = resolveDeviceInstallVariant();
      if (fireVariant === null || readInstallPromptAccepted()) return;
      // Spend this visit's offer at FIRE time, not when it is answered:
      // leaving app chrome unmounts this card, and coming back must not
      // produce a second one.
      markInstallPromptShown(Date.now());
      setVariant(fireVariant);
    };

    const schedule = (delayMs: number) => {
      timer = setTimeout(fire, delayMs);
    };

    const evaluate = () => {
      if (cancelled || timer) return;
      const decision = decideInstallPrompt({
        state: readInstallPromptState(),
        now: Date.now(),
        variant: resolveDeviceInstallVariant(),
        accepted: readInstallPromptAccepted(),
      });

      if (decision.action === 'skip') return;
      if (decision.action === 'arm') {
        // A failed write means no countdown can be remembered, so running a
        // private one would restart it on every mount. Stay quiet instead.
        if (!armInstallPrompt(Date.now())) return;
        schedule(INSTALL_PROMPT_DELAY_MS);
        return;
      }
      if (decision.action === 'wait') {
        schedule(decision.remainingMs);
        return;
      }
      schedule(0);
    };

    evaluate();
    // A desktop browser decides we are installable a beat after load, so the
    // first evaluate above can legitimately find nothing to offer. Re-running
    // on that signal is what makes the desktop half work at all.
    const unsubscribe = subscribeInstallAvailability(evaluate);

    return () => {
      cancelled = true;
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (variant === null) return null;

  // Clear whatever owns the bottom edge below lg — the mobile nav bar when
  // its flag is on, otherwise just the safe area. PushPermissionPrompt's
  // bottomClass, kept identical so the two cards land in the same place.
  const bottomClass = MOBILE_NAV_ENABLED
    ? 'bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6'
    : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-6';

  const settle = (outcome: InstallPromptOutcome) => {
    setVariant(null);
    markInstallPromptSettled(outcome, Date.now());
  };

  const handleDesktopInstall = async () => {
    setIsWorking(true);
    try {
      const outcome = await promptDeferredInstall();
      // 'unavailable' is treated as a decline rather than swallowed: the
      // browser withdrew the offer, so the card must close and the
      // notification ask must be released rather than waiting on an answer
      // that can no longer be given.
      settle(outcome === 'accepted' ? 'accepted' : 'declined');
    } finally {
      setIsWorking(false);
    }
  };

  const copy = COPY[variant];
  const Icon = variant === 'ios' ? Share : variant === 'android' ? Smartphone : MonitorDown;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="install-prompt-title"
      className={`fixed inset-x-4 z-[140] sm:left-auto sm:right-6 sm:w-[22rem] ${bottomClass}`}
    >
      <div className="rounded-2xl border border-stroke-default bg-bg-surface p-4 shadow-[0_24px_70px_-40px_rgb(var(--shadow-ink)/calc(0.8*var(--shadow-alpha-scale)))]">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/15"
            aria-hidden="true"
          >
            <Icon className="h-4 w-4 text-brand" />
          </span>
          <div className="min-w-0 flex-1">
            <p id="install-prompt-title" className="text-sm font-semibold text-content-primary">
              {copy.title}
            </p>
            <p className="mt-1 text-sm leading-6 text-content-secondary">{copy.body}</p>
          </div>
          <button
            type="button"
            onClick={() => settle('declined')}
            aria-label="Dismiss the install prompt"
            className="motion-focus motion-press -mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {variant === 'ios' ? (
          <ol className="mt-3 space-y-1.5 text-sm leading-6 text-content-secondary">
            <li className="flex gap-2">
              <span className="text-content-tertiary" aria-hidden="true">
                1.
              </span>
              <span>
                Tap <span className="font-semibold text-content-primary">Share</span>, the square
                with an arrow out of it. Bottom bar in Safari, top right in Chrome.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-content-tertiary" aria-hidden="true">
                2.
              </span>
              <span>
                Scroll down and tap{' '}
                <span className="font-semibold text-content-primary">Add to Home Screen</span>.
              </span>
            </li>
          </ol>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          {variant === 'ios' ? (
            // One neutral exit and no filled button: the steps above are the
            // payload, and nothing here can perform the install. Full width so
            // it is still a real thumb target without competing with them.
            <button
              type="button"
              onClick={() => settle('declined')}
              className={`${dismissButtonClass} flex-1`}
            >
              {copy.action}
            </button>
          ) : (
            <>
              {variant === 'android' ? (
                <a
                  href={ANDROID_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => settle('accepted')}
                  className={primaryButtonClass}
                >
                  {copy.action}
                </a>
              ) : (
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => void handleDesktopInstall()}
                  className={primaryButtonClass}
                >
                  {isWorking ? 'Installing…' : copy.action}
                </button>
              )}
              <button
                type="button"
                onClick={() => settle('declined')}
                disabled={isWorking}
                className={dismissButtonClass}
              >
                Not now
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
