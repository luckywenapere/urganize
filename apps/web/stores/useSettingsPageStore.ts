'use client';

import { create } from 'zustand';
import { registerSignOutReset } from '@/lib/sign-out-resets';
import type { SettingsSegment } from '@/lib/settings-nav';

/**
 * The Settings page on a phone (Nov 2, 2026, founder approved
 * docs/mocks/settings-page): the fourth page of the swipe row, after Rollouts.
 * `open` puts it in the row (your photo opens it); it leaves the row once you
 * are back on Home. `target` is the setting showing inside it, or null for the
 * list. Kept here rather than in the URL, the same way the Rollouts tab keeps
 * its open chat.
 */
type SettingsPageState = {
  open: boolean;
  target: { segment: SettingsSegment; section: string | null } | null;
  setOpen: (open: boolean) => void;
  setTarget: (target: { segment: SettingsSegment; section: string | null } | null) => void;
};

export const useSettingsPageStore = create<SettingsPageState>((set) => ({
  open: false,
  target: null,
  setOpen: (open) => set(open ? { open } : { open, target: null }),
  setTarget: (target) => set({ target }),
}));

registerSignOutReset('settings-page', () => {
  useSettingsPageStore.setState({ open: false, target: null });
});
