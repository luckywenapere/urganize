'use client';

import { useCallback, type MouseEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  const pathname = usePathname();

  return useCallback(
    (target?: SettingsTarget) => {
      const search = window.location.search;
      const wasOpen = new URLSearchParams(search).has(SETTINGS_PARAM);
      // A page without app chrome has nothing mounted to read the param, so the
      // dashboard is where it opens from there.
      const url = canHostSettings(pathname)
        ? buildSettingsUrl(pathname ?? '/dashboard', search, target)
        : settingsDeepLink(target);
      if (wasOpen) {
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
      }
    },
    [pathname, router]
  );
}

/**
 * Close it. REPLACE, never `router.back()`: a deep link can make the open URL
 * the first history entry in a tab, and back() would then leave the app.
 */
export function useCloseSettings() {
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(() => {
    router.replace(closeSettingsUrl(pathname ?? '/dashboard', window.location.search), {
      scroll: false,
    });
  }, [pathname, router]);
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
