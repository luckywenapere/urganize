'use client';

import { useEffect } from 'react';
import { SettingsPane } from '@/components/shell/swipe/SettingsPane';
import { useSettingsPageStore } from '@/stores/useSettingsPageStore';

/**
 * Settings as a page on a computer (Nov 2, 2026, founder approved
 * docs/mocks/desktop-nav): the list on the left with search at its bottom, the
 * open setting on the right. On a phone the swipe shell draws its own Settings
 * page and this one is not shown.
 */
export default function AccountPageClient() {
  const setOpen = useSettingsPageStore((state) => state.setOpen);
  useEffect(() => {
    setOpen(true);
  }, [setOpen]);
  return <SettingsPane showHelp split />;
}
