'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether someone has seen Urganize Music from the workspace yet (#1378).
 * Until they open it once, the Home card carries a New tag and the headphones
 * circle a dot. Kept on this device per account: nothing to sync, and the
 * worst case is the tag showing once more on a new phone.
 */
const KEY_PREFIX = 'urganize.music.intro-seen.';
const EVENT = 'urganize:music-intro-seen';

const keyFor = (userId: string) => `${KEY_PREFIX}${userId}`;

function read(userId: string | null): boolean {
  if (!userId) return true;
  try {
    return window.localStorage.getItem(keyFor(userId)) === '1';
  } catch {
    return true;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** True once this account has opened Urganize Music from the workspace. True
 *  on the server and with no account, so nothing flashes a tag it then takes
 *  away. */
export function useMusicIntroSeen(userId: string | null): boolean {
  return useSyncExternalStore(subscribe, () => read(userId), () => true);
}

export function markMusicIntroSeen(userId: string | null): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(keyFor(userId), '1');
  } catch {
    // Restricted storage: the tag may show again next time, no harm.
  }
  window.dispatchEvent(new Event(EVENT));
}
