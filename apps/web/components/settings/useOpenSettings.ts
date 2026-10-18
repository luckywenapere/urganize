'use client';

import { useCallback, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { markNavigationBlocked } from '@/lib/nav-stall-watch';
import {
  SETTINGS_PARAM,
  buildSettingsUrl,
  canHostSettings,
  closeSettingsUrl,
  isPlainLeftClick,
  settingsDeepLink,
  type SettingsTarget,
} from '@/lib/settings-nav';

/**
 * Open the settings pop-up over the page the person is on.
 *
 * Reads `window.location.search` at CALL time rather than subscribing with
 * `useSearchParams` — the `MobileNavBar` pattern. This hook is used by chrome
 * that is mounted on every route (the topbar, the identity card), and reading
 * search params in a statically prerendered client component bails the whole
 * route out to its nearest Suspense boundary, which is how `/auth` once served a
 * spinner as its HTML. A click handler needs one answer on demand, not a
 * subscription.
 *
 * History: opening from closed PUSHES, so the browser Back button closes the
 * pop-up; re-pointing an already-open one REPLACES, so Back never walks through
 * every segment somebody clicked. Same model as `useSceneOverlay`.
 *
 * Shallow, with the native History API (2026-10-18, URG founder report
 * "Settings buttons are not working on mobile, multiple clicks"): the pop-up
 * only changes a query param on the page that is already showing, so it
 * writes the URL with `window.history.pushState` / `replaceState`, which
 * Next.js syncs into `useSearchParams` locally (the CalendarScene pattern).
 * `router.push` / `router.replace` fetched the route's server payload for every
 * new `?settings=` value before committing the URL, so on phone data every tap
 * (opening it, each segment row, Back to all settings, the X) waited a network
 * round trip and read as dead, and the link watchdog swallowed the re-taps on
 * the More sheet's Settings row as duplicates of the first. Only the fallback
 * to the dashboard (a page without app chrome) is a real navigation.
 */
export function useOpenSettings() {
  const router = useRouter();

  return useCallback(
    (target?: SettingsTarget) => {
      // The pathname is read live too, not from usePathname: a navigation that
      // is still landing (the create flow pushes the new rollout, then the share
      // sheet opens Settings) would otherwise pair a stale path with the new
      // query string, or the other way round.
      const pathname = window.location.pathname;
      const search = window.location.search;
      const wasOpen = new URLSearchParams(search).has(SETTINGS_PARAM);
      // A page without app chrome has nothing mounted to read the param, so the
      // dashboard is where it opens from there.
      const url = canHostSettings(pathname)
        ? buildSettingsUrl(pathname, search, target)
        : settingsDeepLink(target);
      if (!canHostSettings(pathname)) {
        router.push(url, { scroll: false });
        return;
      }
      writeSettingsUrl(url, wasOpen ? 'replace' : 'push');
    },
    [router]
  );
}

/**
 * Write a settings URL on the page that is showing, without a navigation.
 *
 * The state is `null` ON PURPOSE. Next's patched pushState/replaceState copy
 * its own entry data onto a state that lacks it and then sync the new URL into
 * `usePathname` / `useSearchParams`; a state that already carries Next's `__NA`
 * marker (such as `window.history.state`) is taken for Next's own call and
 * written straight through with NO sync, so the URL would change and the
 * pop-up would not.
 */
export function writeSettingsUrl(url: string, mode: 'push' | 'replace'): void {
  if (mode === 'push') window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

/**
 * Close it. REPLACE, never `router.back()`: a deep link can make the open URL
 * the first history entry in a tab, and back() would then leave the app.
 */
export function useCloseSettings() {
  return useCallback(() => {
    // Live pathname and search, so closing always removes the param from the URL
    // the person is actually on, never from a stale render's copy of it.
    // Shallow, like opening: nothing on the page changes but the param.
    writeSettingsUrl(closeSettingsUrl(window.location.pathname, window.location.search), 'replace');
  }, []);
}

/**
 * The `onClick` for an entry point that is still a real link. A plain left click
 * opens the pop-up in place; a modified click falls through to the link's own
 * `href`, which is a real URL that opens the pop-up on a fresh load. That is
 * why the entry points stayed links rather than becoming buttons: a new tab
 * still works.
 */
export function useSettingsLinkClick(target?: SettingsTarget, onOpen?: () => void) {
  const open = useOpenSettings();
  // Destructured because `target` is a fresh object literal at most call sites;
  // its parts are what matter, not its identity.
  const segment = target?.segment;
  const section = target?.section;
  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!isPlainLeftClick(event)) return;
      event.preventDefault();
      // On a page that hosts the pop-up this link is handled here, not
      // navigated: tell the link watchdog, so it neither reports a stall nor
      // arms a hard load of the link's href. Elsewhere it is a real trip to the
      // dashboard, which the watchdog should keep watching.
      if (canHostSettings(window.location.pathname)) markNavigationBlocked(event.nativeEvent);
      onOpen?.();
      open({ segment, section });
    },
    [open, segment, section, onOpen]
  );
}
