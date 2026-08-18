'use client';

import { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { isAndroidBrowser } from '@/lib/platform';
import { readPersistedState, writePersistedState } from '@/lib/persisted-state';

// Dismissal is remembered per browser (the InviteTeamBanner precedent): once
// closed, it stays gone rather than nagging every visit.
const DISMISSED_KEY = 'urganize.android-banner.dismissed';
const DISMISSED_VERSION = 1;
const isPersistedDismissed = (value: unknown): value is boolean => typeof value === 'boolean';

// The marketing site's /download page — noindex, handed out directly rather
// than discovered. Cross-domain because the product app (app.urganize.app)
// and the marketing site (urganize.app) are two separate Vercel projects.
const DOWNLOAD_URL = 'https://urganize.app/download';

/**
 * Soft, dismissible prompt steering Android browser visitors toward the
 * native app instead of the mobile web. Deliberately never shown inside the
 * Capacitor native shell itself (isAndroidBrowser() excludes it) — this is
 * about visitors who haven't installed the app yet, not the app correcting
 * itself. Renders nothing until mount so a dismissed or non-Android visitor
 * never sees a flash.
 */
export function AndroidAppBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isAndroidBrowser()) return;
    const dismissed = readPersistedState(DISMISSED_KEY, DISMISSED_VERSION, isPersistedDismissed);
    if (dismissed !== true) {
      setIsVisible(true);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="flex flex-col items-start gap-3 border-b border-stroke-default bg-bg-surface px-3 py-2 sm:flex-row sm:items-center sm:px-4">
      <Smartphone className="hidden h-4 w-4 shrink-0 text-content-tertiary sm:block" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-content-secondary sm:truncate">
        Get the Urganize app for a faster, smoother experience on Android
      </p>
      <a
        href={DOWNLOAD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="motion-focus motion-press inline-flex h-auto min-h-8 shrink-0 items-center gap-1.5 self-stretch border border-stroke-default bg-bg-elevated px-3 py-1.5 text-left text-xs font-semibold text-content-primary transition-colors hover:bg-bg-hover sm:self-auto"
      >
        Download the app
      </a>
      <button
        type="button"
        onClick={() => {
          setIsVisible(false);
          writePersistedState(DISMISSED_KEY, DISMISSED_VERSION, true);
        }}
        aria-label="Dismiss Android app banner"
        className="motion-focus motion-press grid h-7 w-7 shrink-0 place-items-center text-content-tertiary transition-colors hover:bg-bg-hover hover:text-content-primary"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
