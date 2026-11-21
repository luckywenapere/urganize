'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  EMPTY_LIBRARY,
  isSaved as libraryIsSaved,
  MUSIC_LIBRARY_KEY,
  parseLibrary,
  serializeLibrary,
  toggleSaved,
  type MusicLibrary,
} from '@/lib/music/library';

/**
 * The listener's liked songs, kept on this device.
 *
 * One small store shared by every component, so a heart pressed in the player
 * lights the same heart in the list at once, and a second tab stays in step
 * through the storage event. Storage can be blocked (private windows) or full;
 * then the choice still holds for this visit and nothing breaks.
 */

let cache: { raw: string | null; value: MusicLibrary } = { raw: null, value: EMPTY_LIBRARY };
let memoryOnly: MusicLibrary | null = null;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(MUSIC_LIBRARY_KEY);
  } catch {
    return null;
  }
}

function getSnapshot(): MusicLibrary {
  if (memoryOnly) return memoryOnly;
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, value: parseLibrary(raw) };
  return cache.value;
}

function write(next: MusicLibrary) {
  try {
    window.localStorage.setItem(MUSIC_LIBRARY_KEY, serializeLibrary(next));
    memoryOnly = null;
  } catch {
    memoryOnly = next;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === MUSIC_LIBRARY_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useMusicLibrary() {
  const library = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_LIBRARY);
  const toggleSave = useCallback((trackId: string) => write(toggleSaved(getSnapshot(), trackId)), []);
  const isSaved = useCallback((trackId: string) => libraryIsSaved(library, trackId), [library]);
  return { library, toggleSave, isSaved };
}
