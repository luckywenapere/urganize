'use client';

import { useEffect, useState } from 'react';
import { Share, Smartphone, X } from 'lucide-react';
import {
  INSTALL_PROMPT_DELAY_MS,
  decideInstallPrompt,
  markInstallPromptSettled,
  readInstallPromptSettled,
  readInstallPromptViews,
  resolveDeviceInstallVariant,
  subscribeInstallPromptViews,
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
  'motion-focus motion-press rounded-lg border border-transparent px-4 py-2 text-sm font-semibold text-content-secondary hover:bg-bg-hover hover:text-content-primary';

const primaryButtonClass =
  'motion-focus motion-press flex-1 rounded-lg border border-transparent bg-brand px-4 py-2 text-center text-sm font-semibold text-content-inverse hover:bg-brand-hover';

/**
 * "You've had a look around — put us on your Home Screen" (founder request,
 * 2026-08-30). Flag: NEXT_PUBLIC_FEATURE_INSTALL_PROMPT.
 *
 * Offered once someone has opened three distinct surfaces in a session —
 * the founder's "observed to be browsing through the different tabs" — and
 * answered once per device. lib/install-prompt.ts holds the counting, the
 * decision and the fail-closed storage rules.
 *
 * WHY THE iOS SIDE ONLY TEACHES. There is no beforeinstallprompt on iOS and
 * no API of any kind that opens Add to Home Screen: Apple routes it through
 * the share sheet and nothing on the page can reach it. So the iOS card is
 * instructions, and the button only acknowledges them. Pretending otherwise
 * would mean a primary button that visibly does nothing — the failure
 * PushPermissionPrompt's own header warns about for the permission dialog.
 *
 * WHY ANDROID IS A LINK AND NOT A PWA INSTALL. There is a real Android build
 * (apps/mobile, distributed as an APK from the marketing site). Offering the
 * web app's install banner instead would put a second-best copy in front of
 * someone who can have the actual app, and it is what the founder asked for
 * in as many words.
 *
 * SLOT SHARED WITH PushPermissionPrompt, deliberately: bottom of the screen
 * where a thumb reaches, clear of the mobile nav bar, z-[140] so anything
 * the user deliberately opens covers it. The two never overlap because the
 * notification ask waits for this one to be answered — see the install-owed
 * branch in PushPermissionPrompt.
 */
export function InstallAppPrompt() {
  const [variant, setVariant] = useState<InstallPromptVariant>(null);

  useEffect(() => {
    // Device capability and the stored answer are both read once per mount;
    // the view count is what changes as the session goes on.
    const deviceVariant = resolveDeviceInstallVariant();
    if (deviceVariant === null) return;
    if (readInstallPromptSettled() !== null) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const evaluate = (views: string[]) => {
      if (cancelled || timer) return;
      const decision = decideInstallPrompt({
        viewCount: views.length,
        variant: deviceVariant,
        settled: false,
      });
      if (decision !== 'fire') return;
      timer = setTimeout(() => {
        if (!cancelled) setVariant(deviceVariant);
      }, INSTALL_PROMPT_DELAY_MS);
    };

    // Evaluate what is already stored before subscribing: this component
    // mounts on the first chrome-bearing page, but a reload part-way through
    // a session comes back with the threshold already met, and waiting for a
    // fourth navigation to notice would be wrong.
    evaluate(readInstallPromptViews());
    const unsubscribe = subscribeInstallPromptViews(evaluate);

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
    markInstallPromptSettled(outcome);
  };

  const isIOS = variant === 'ios';

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
            {isIOS ? (
              <Share className="h-4 w-4 text-brand" />
            ) : (
              <Smartphone className="h-4 w-4 text-brand" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p id="install-prompt-title" className="text-sm font-semibold text-content-primary">
              {isIOS ? 'Keep Urganize on your Home Screen' : 'Get the Urganize app'}
            </p>
            <p className="mt-1 text-sm leading-6 text-content-secondary">
              {isIOS
                ? 'It opens full screen, straight to your work — and it is the only way an iPhone will let us send you reminders.'
                : 'The app opens faster than the browser and can send you reminders when work is due.'}
            </p>
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

        {isIOS ? (
          <ol className="mt-3 space-y-1.5 text-sm leading-6 text-content-secondary">
            <li className="flex gap-2">
              <span className="text-content-tertiary" aria-hidden="true">
                1.
              </span>
              <span>
                Tap the <span className="font-semibold text-content-primary">Share</span> button in
                your browser bar.
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
          {isIOS ? (
            <button type="button" onClick={() => settle('accepted')} className={primaryButtonClass}>
              Got it
            </button>
          ) : (
            <a
              href={ANDROID_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => settle('accepted')}
              className={primaryButtonClass}
            >
              Get the app
            </a>
          )}
          <button type="button" onClick={() => settle('declined')} className={dismissButtonClass}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
