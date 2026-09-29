'use client';

import { create } from 'zustand';
import { withDirtyKey, type DirtyKeys } from '@/lib/settings-dirty';

// Which settings fields hold an edit that has not been saved, so the pop-up can
// ask "Discard changes?" before it closes. A store rather than context because
// the sections that report are deep inside segments the pop-up keeps mounted,
// and the only reader is the pop-up's close button. The rules are in
// lib/settings-dirty.ts; this is only where the state lives.

type SettingsDirtyStore = {
  keys: DirtyKeys;
  setDirty: (key: string, dirty: boolean) => void;
  reset: () => void;
};

export const useSettingsDirtyStore = create<SettingsDirtyStore>((set, get) => ({
  keys: {},
  setDirty: (key, dirty) => {
    const current = get().keys;
    const next = withDirtyKey(current, key, dirty);
    // Same object back means nothing changed; skip the notification so a
    // section reporting on every render does not wake every subscriber.
    if (next !== current) set({ keys: next });
  },
  reset: () => set({ keys: {} }),
}));
