'use client';

import { useEffect } from 'react';
import { BOOT_LOADER_EVENT, readPageAppearance } from '@/lib/native-appearance';
import { request, shellSupports, whenInShell } from '@/lib/native-bridge';

/**
 * Native-only, mounted app-wide (see AppShell). Tells the Expo shell the page's
 * ground colour, so the bars above and below the webview match the page rather
 * than staying dark in light mode. Renders nothing, and does nothing at all in
 * a browser.
 *
 * It reports again when the theme changes: the Appearance toggle in Settings
 * flips data-theme on <html>, and a visitor who never chose one follows the
 * phone's own setting. Only a real change is sent, and a failed send is
 * forgotten so the next change tries again.
 */
export function NativeAppearanceBridge() {
  useEffect(() => {
    let lastSent = '';
    let stopWatching = () => {};

    const report = () => {
      if (!shellSupports('appearance')) return;
      const appearance = readPageAppearance();
      if (!appearance) return;
      const key = `${appearance.background}|${appearance.statusBar}`;
      if (key === lastSent) return;
      lastSent = key;
      request('appearance', appearance).catch(() => {
        lastSent = '';
      });
    };

    // A boot loader coming or going (LoadingScreen fires the event from its
    // effects) changes which ground the bars should take. Read on the next
    // frame, once React has finished putting the DOM in place.
    let frame = 0;
    const reportSoon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(report);
    };

    const start = () => {
      report();
      const observer = new MutationObserver(report);
      // data-auth-session: removing it on /auth hides the pre-hydration loader.
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'class', 'data-auth-session'],
      });
      const media = window.matchMedia?.('(prefers-color-scheme: dark)');
      media?.addEventListener?.('change', report);
      window.addEventListener(BOOT_LOADER_EVENT, reportSoon);
      stopWatching = () => {
        observer.disconnect();
        media?.removeEventListener?.('change', report);
        window.removeEventListener(BOOT_LOADER_EVENT, reportSoon);
        cancelAnimationFrame(frame);
      };
    };

    const stopWaiting = whenInShell(start);
    return () => {
      stopWaiting();
      stopWatching();
    };
  }, []);

  return null;
}
