/** Where the artist roster is saved on the device (stores/useArtistRosterStore.ts).
 *  A constant of its own so the sign-out cleanup in lib/auth-store.ts can clear
 *  it without importing a store into the shared auth bundle. */
export const ROSTER_CACHE_KEY = 'urganize.cache.artist-roster';
