'use client';

import type { SettingsSegment } from '@/lib/settings-nav';
import { SETTINGS_PAGE_HREF } from '@/lib/swipe-nav';
import { canHostSettings } from '@/lib/settings-nav';
import { useSettingsPageStore } from '@/stores/useSettingsPageStore';
import { useSwipeNavStore } from '@/stores/useSwipeNavStore';

/**
 * Open the phone's Settings page (Nov 2, 2026), on its list or on one setting.
 * From a tab it glides there through the swipe row; from a page pushed over a
 * tab (a rollout, a person) it navigates to the Settings address, which lands
 * on the same page of the row.
 */
export function openSettingsPage(
  push: (href: string) => void,
  target: { segment: SettingsSegment; section: string | null } | null = null
): void {
  const store = useSettingsPageStore.getState();
  store.setOpen(true);
  store.setTarget(target);
  const go = useSwipeNavStore.getState().go;
  if (go && document.documentElement.dataset.swipeNav === 'tab') {
    go('settings');
    return;
  }
  push(SETTINGS_PAGE_HREF);
}

/** True where Settings is a page: everywhere in the app since Nov 2, 2026
 *  (the computer layout, docs/mocks/desktop-nav), so never the pop-up. Pages
 *  outside the app chrome still go through the dashboard. */
export function settingsIsAPage(): boolean {
  if (typeof document === 'undefined') return false;
  return canHostSettings(window.location.pathname);
}
