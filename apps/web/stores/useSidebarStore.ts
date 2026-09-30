'use client';

import { create } from 'zustand';
import { writePersistedState } from '@/lib/persisted-state';
import {
  DEFAULT_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_COLLAPSED_VERSION,
  SIDEBAR_WIDTH_KEY,
  SIDEBAR_WIDTH_VERSION,
} from '@/lib/sidebar-width';

/**
 * The workspace side menu's own chrome state: how wide it is, and whether it
 * is collapsed to its icon rail. Pure UI state, persisted so a reload does not
 * snap the layout back — the same lib/persisted-state pattern as the UrgAns
 * rail's railOpen / railWidth.
 *
 * WHY A STORE, when `collapsed` deliberately lived as local component state
 * until now. That note said it stayed local "because nothing outside this
 * panel toggles it", which was true and is the condition that just changed:
 * RightRail has to READ the menu's effective width to compute the chat's own
 * maximum, and the effective width is 64px whenever the menu is collapsed. So
 * the rail needs both values, and a second copy of either — mirrored from a
 * prop or re-read from storage — is the drift this repo keeps correcting.
 * Nothing outside this panel WRITES either one; the panel is still the only
 * writer.
 *
 * Bounds, clamping and the storage validators all live in lib/sidebar-width.ts;
 * this store only holds the numbers. Both values are hydrated by the panel in
 * a mount effect, so the first paint always renders the defaults and a stored
 * value never reaches a render-time storage read.
 */

type SidebarStore = {
  /** Expanded width in px. Always a whole number inside the absolute range;
   *  the panel clamps it again to whatever THIS viewport can pay for. Holds
   *  its value while collapsed, so expanding restores the width the user
   *  chose rather than the default. */
  width: number;
  collapsed: boolean;
  /** Sets the width AND persists it. Called once when a drag ENDS, never per
   *  pointermove: writePersistedState does not guard setItem, so a per-frame
   *  write would hammer storage and throw on a full quota. */
  setWidth: (width: number) => void;
  /** Applies a stored width without writing it back — the panel's mount
   *  effect is the only caller, and writing here would re-save what we just
   *  read. */
  hydrateWidth: (width: number) => void;
  setCollapsed: (collapsed: boolean) => void;
  hydrateCollapsed: (collapsed: boolean) => void;
};

export const useSidebarStore = create<SidebarStore>((set) => ({
  width: DEFAULT_SIDEBAR_WIDTH,
  collapsed: false,
  setWidth: (width) => {
    set({ width });
    try {
      writePersistedState(SIDEBAR_WIDTH_KEY, SIDEBAR_WIDTH_VERSION, width);
    } catch {
      // Quota exceeded, or Safari private mode where getItem works and
      // setItem throws. A width that could not be saved still applies for
      // this session, which is the right way round to fail.
    }
  },
  hydrateWidth: (width) => set({ width }),
  setCollapsed: (collapsed) => {
    set({ collapsed });
    try {
      writePersistedState(SIDEBAR_COLLAPSED_KEY, SIDEBAR_COLLAPSED_VERSION, collapsed);
    } catch {
      // Same as above: the layout follows for this session either way.
    }
  },
  hydrateCollapsed: (collapsed) => set({ collapsed }),
}));
