'use client';

import { useEffect } from 'react';
import { useSettingsDirtyStore } from '@/stores/useSettingsDirtyStore';

/**
 * Tell the settings pop-up that this field holds an edit that is not saved.
 *
 * Call it from the section that owns the draft, with a key unique to the field
 * (`'profile.name'`, `'artist:<id>'`). It clears itself when the field is saved
 * or put back, and when the section unmounts, so a field can never be left
 * marked after the thing that owned it is gone.
 *
 * Only text fields report. Toggles save the instant they are tapped, so there is
 * nothing for them to lose.
 */
export function useReportDirty(key: string, dirty: boolean): void {
  const setDirty = useSettingsDirtyStore((state) => state.setDirty);

  useEffect(() => {
    setDirty(key, dirty);
  }, [key, dirty, setDirty]);

  useEffect(() => () => setDirty(key, false), [key, setDirty]);
}
