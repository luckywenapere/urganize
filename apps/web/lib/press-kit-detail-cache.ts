import type { PressKit, PressKitAsset, PressKitSection } from '@/types/press-kits';

/**
 * The single-kit screen's payload, held in MEMORY for a few minutes.
 *
 * WHY MEMORY AND NOT DISK, which is the whole reason this is its own module
 * rather than another localStorage cache like the roster's. Every photo in
 * `assets` carries a signed Supabase URL with a one hour life. A persisted copy
 * would outlive the session and hand back URLs that 403, which is the trap
 * CLAUDE.md records for the files, song and capture scenes. In memory the cache
 * dies with the tab, and a full reload always gets truth.
 *
 * THE TTL IS DERIVED FROM THAT LIFETIME, not picked for feel.
 * ASSET_SIGNED_URL_TTL_SECONDS is 3600, and the server re-signs only once a URL
 * is 80% through its life — so a URL handed to us can already be 2880s old,
 * leaving a worst case of 720s (twelve minutes) of validity. Five minutes keeps
 * the oldest URL we can serve at 3180s, seven minutes inside the wall. Raising
 * this without redoing that arithmetic is how a thumbnail starts 403ing.
 *
 * Even past it the failure is soft: PhotoGrid renders plain `<img>` with an
 * `onError` that falls back to a placeholder, precisely because these URLs
 * expire.
 *
 * It exists because opening a kit used to mean a full page skeleton every time,
 * even when you had been looking at it seconds earlier (founder request,
 * 2026-09-05, following the roster's own cache).
 */

export type PressKitDetailSnapshot = {
  kit: PressKit | null;
  artistName: string;
  sections: PressKitSection[];
  assets: PressKitAsset[];
  aiAvailable: boolean;
};

/** Five minutes. See the module header for the arithmetic behind it. */
export const KIT_DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;

type Entry = PressKitDetailSnapshot & { at: number };

const cache = new Map<string, Entry>();

/**
 * The last known payload for one kit, or null when there is none or it has
 * aged out. `now` is injectable so the TTL is testable without fake timers.
 *
 * An expired read EVICTS rather than just answering null: the entry is only
 * getting older, and holding photo URLs nobody may use is pure waste.
 *
 * A `now` earlier than the write is treated as expired. That covers a clock
 * that moved backwards, where a signed age of "negative" would otherwise read
 * as fresh indefinitely.
 */
export function readCachedKitDetail(
  kitId: string,
  now: number = Date.now()
): PressKitDetailSnapshot | null {
  const entry = cache.get(kitId);
  if (!entry) return null;

  const age = now - entry.at;
  if (age < 0 || age > KIT_DETAIL_CACHE_TTL_MS) {
    cache.delete(kitId);
    return null;
  }

  const { at: _at, ...snapshot } = entry;
  return snapshot;
}

export function writeCachedKitDetail(
  kitId: string,
  snapshot: PressKitDetailSnapshot,
  now: number = Date.now()
) {
  if (!kitId) return;
  cache.set(kitId, { ...snapshot, at: now });
}

/** Called on sign-out beside the roster's own reset: this holds one account's
 *  photos and bios, and the map would otherwise survive a same-tab account
 *  switch. */
export function clearKitDetailCache() {
  cache.clear();
}
