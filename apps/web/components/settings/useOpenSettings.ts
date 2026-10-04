'use client';

import { useCallback, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
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
      if (wasOpen) {
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
      }
    },
    [router]
  );
}

/**
 * Close it. REPLACE, never `router.back()`: a deep link can make the open URL
 * the first history entry in a tab, and back() would then leave the app.
 */
export function useCloseSettings() {
  const router = useRouter();

  return useCallback(() => {
    // Live pathname and search, so closing always removes the param from the URL
    // the person is actually on, never from a stale render's copy of it.
    router.replace(closeSettingsUrl(window.location.pathname, window.location.search), {
      scroll: false,
    });
  }, [router]);
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
      onOpen?.();
      open({ segment, section });
    },
    [open, segment, section, onOpen]
  );
}
