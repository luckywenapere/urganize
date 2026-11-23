'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { hasShellUserAgent } from '@urganize/native-bridge';
import { buildChromeIntentUrl, detectInAppBrowser, isAndroidUserAgent } from '@/lib/in-app-browser';

/**
 * Wraps a "Continue with Google" button (#1380). In an Instagram, TikTok,
 * Snapchat, WhatsApp, LinkedIn, Facebook or X in-app browser Google refuses
 * the sign-in (403 disallowed_useragent), so the button is swapped for a short
 * card that says why and offers to open the page in the real browser. Email
 * sign-up on the page stays as it is.
 *
 * The answer is read on the client after hydration (server snapshot: not an
 * in-app browser), so the server-rendered front-door pages stay static and
 * still show the Google button with scripts blocked, where it cannot work
 * anyway. Never use useSearchParams here.
 */
function subscribe(): () => void {
  return () => {};
}

function readInApp(): boolean {
  try {
    const ua = window.navigator.userAgent;
    // Our own app shells are not in-app browsers for this purpose.
    if (hasShellUserAgent(ua)) return false;
    if (typeof (window as Window & { Capacitor?: unknown }).Capacitor !== 'undefined') return false;
    return detectInAppBrowser(ua) !== null;
  } catch {
    return false;
  }
}

export function useInAppBrowser(): boolean {
  return useSyncExternalStore(subscribe, readInApp, () => false);
}

export function GoogleGate({ children, className = '' }: { children: ReactNode; className?: string }) {
  const inApp = useInAppBrowser();
  if (!inApp) return <>{children}</>;
  return <OpenInBrowserCard className={className} />;
}

function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return Promise.resolve(ok);
  } catch {
    return Promise.resolve(false);
  }
}

function OpenInBrowserCard({ className }: { className: string }) {
  const [copied, setCopied] = useState<'idle' | 'yes' | 'no'>('idle');
  const href = typeof window === 'undefined' ? '' : window.location.href;
  const android = typeof window !== 'undefined' && isAndroidUserAgent(window.navigator.userAgent);
  const intentUrl = android && href ? buildChromeIntentUrl(href) : null;
  const buttonClass =
    'inline-flex min-h-11 items-center justify-center rounded-xl border border-stroke-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-content-primary transition-colors hover:bg-bg-elevated';

  return (
    <div
      role="note"
      data-testid="in-app-browser-card"
      className={`rounded-xl border border-stroke-default bg-bg-surface p-4 text-left ${className}`}
    >
      <p className="text-sm font-semibold text-content-primary">Open in your browser to use Google</p>
      <p className="mt-1 text-sm text-content-secondary">
        Google does not work inside this app. You can sign up with your email below, or open this page in your browser.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={buttonClass}
          onClick={() => void copyText(href).then((ok) => setCopied(ok ? 'yes' : 'no'))}
        >
          {copied === 'yes' ? 'Link copied' : 'Copy link'}
        </button>
        {intentUrl ? (
          <a href={intentUrl} className={buttonClass}>
            Open in Chrome
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-content-tertiary" aria-live="polite">
        {copied === 'no'
          ? 'Could not copy. Press and hold the address, then copy it.'
          : android
            ? 'Or tap the three dots and choose Open in browser.'
            : 'Or tap the three dots or the share icon and choose Open in Safari.'}
      </p>
    </div>
  );
}
