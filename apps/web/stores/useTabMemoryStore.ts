'use client';

import { create } from 'zustand';
import { registerSignOutReset } from '@/lib/sign-out-resets';
import { HOME_MEMORY_KEY as KEY } from '@/lib/tab-memory';

function read(): string | null {
  try {
    const value = window.sessionStorage.getItem(KEY);
    return value && value.startsWith('/dashboard') ? value : null;
  } catch {
    return null;
  }
}

function write(value: string | null) {
  try {
    if (value) window.sessionStorage.setItem(KEY, value);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the memory still lasts for this page life.
  }
}

/**
 * Where Home was left (lib/tab-memory.ts). Kept for the browser tab's life in
 * sessionStorage, so a reload on another tab still swipes back to the rollout.
 */
type TabMemoryState = {
  homePath: string | null;
  setHomePath: (path: string | null) => void;
};

export const useTabMemoryStore = create<TabMemoryState>((set, get) => ({
  homePath: typeof window === 'undefined' ? null : read(),
  setHomePath: (homePath) => {
    if (get().homePath === homePath) return;
    write(homePath);
    set({ homePath });
  },
}));

registerSignOutReset('tab-memory', () => {
  write(null);
  useTabMemoryStore.setState({ homePath: null });
});
