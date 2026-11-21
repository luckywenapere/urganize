/**
 * A listener's own corner: the songs they liked (called "saved" in code).
 * Kept on the device they are using, because listening needs no account. Pure,
 * so what survives a bad or old stored value, and where the limit is, is held
 * by tests instead of being rebuilt inside a component.
 */

import { MUSIC_SAVED_LIMIT } from './rules';

export const MUSIC_LIBRARY_KEY = 'urganize.music.library';

export type MusicLibrary = {
  /** Liked song ids, newest like first. */
  saved: string[];
};

export const EMPTY_LIBRARY: MusicLibrary = { saved: [] };

/** Reads a stored value. Anything unreadable is an empty library, never a crash.
 *  Older stored values that carried other fields are read for the ids only. */
export function parseLibrary(raw: string | null | undefined): MusicLibrary {
  if (!raw) return EMPTY_LIBRARY;
  try {
    const data = JSON.parse(raw) as { saved?: unknown } | null;
    if (!data || typeof data !== 'object' || !Array.isArray(data.saved)) return EMPTY_LIBRARY;
    const seen = new Set<string>();
    const saved: string[] = [];
    for (const item of data.saved) {
      if (typeof item !== 'string') continue;
      const id = item.trim();
      if (!id || id.length > 64 || seen.has(id)) continue;
      seen.add(id);
      saved.push(id);
      if (saved.length >= MUSIC_SAVED_LIMIT) break;
    }
    return { saved };
  } catch {
    return EMPTY_LIBRARY;
  }
}

export function serializeLibrary(library: MusicLibrary): string {
  return JSON.stringify(library);
}

export const isSaved = (library: MusicLibrary, trackId: string): boolean => library.saved.includes(trackId);

/** Likes a song at the top, or removes the like if it is already there. The
 *  oldest like drops off when the list is full. */
export function toggleSaved(library: MusicLibrary, trackId: string): MusicLibrary {
  if (isSaved(library, trackId)) {
    return { saved: library.saved.filter((id) => id !== trackId) };
  }
  return { saved: [trackId, ...library.saved].slice(0, MUSIC_SAVED_LIMIT) };
}

/** Puts songs in the order they were liked, leaving out any that are gone. */
export function orderBySaved<T extends { id: string }>(library: MusicLibrary, tracks: T[]): T[] {
  const byId = new Map(tracks.map((track) => [track.id, track]));
  return library.saved.map((id) => byId.get(id)).filter((track): track is T => Boolean(track));
}
