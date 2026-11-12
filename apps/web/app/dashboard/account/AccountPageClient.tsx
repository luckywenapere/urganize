'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SettingsPane } from '@/components/shell/swipe/SettingsPane';
import { useSettingsPageStore } from '@/stores/useSettingsPageStore';
import { useArtistFilterSync } from '@/components/shell/useArtistFilter';
import { hasInAppPredecessor } from '@/lib/in-app-history';
import { useIsDesktopViewport } from '@/components/workspace/useIsDesktopViewport';
import { AccountDesk } from '@/components/settings/desk/AccountDesk';

/**
 * Settings on a computer (Nov 2, 2026, founder approved
 * docs/mocks/desktop-settings-full): the whole screen, no top bar or side
 * menu (WorkspaceFrame leaves them off on this route), one centred column like
 * the phone, and an X at the top right back to the page you were on. On a
 * phone the swipe shell draws its own Settings page and this one is not shown.
 *
 * From lg up (#1226, founder approved docs/mocks/account-team-desktop) this is
 * one page of the settings menu instead, inside the normal top bar: a left menu
 * and the chosen page beside it. "Showing: All artists" is not here on a
 * computer; it is the artist switcher on Home.
 */
export default function AccountPageClient() {
  const router = useRouter();
  const desktop = useIsDesktopViewport();
  // The top bar normally loads the artist list; it is off on this page.
  useArtistFilterSync();
  const setOpen = useSettingsPageStore((state) => state.setOpen);
  const setTarget = useSettingsPageStore((state) => state.setTarget);
  useEffect(() => {
    setOpen(true);
  }, [setOpen]);

  const close = () => {
    setTarget(null);
    // Back to the Urganize page you came from; opened from outside, go Home.
    if (hasInAppPredecessor()) router.back();
    else router.push('/dashboard');
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (desktop || event.key !== 'Escape' || event.defaultPrevented) return;
      if (useSettingsPageStore.getState().target) return;
      const field = document.activeElement;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) return;
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (desktop) return <AccountDesk />;
  return <SettingsPane showHelp onClose={close} />;
}
