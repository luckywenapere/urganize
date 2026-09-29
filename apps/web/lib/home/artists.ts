import type { HomeArtistChip } from './types';

/**
 * The artist filter chips: every roster artist, plus any artist an in-flight
 * release belongs to (covering the edge case of a release whose artist
 * somehow isn't in the roster read — never silently dropping a real release
 * from the filter). Roster names win when both sources name the same artist,
 * since `artists.name` is the canonical source and a release's `artistName`
 * is only a write-through cache of it.
 */
export function buildArtistChips(
  inFlightReleases: readonly { artistId: string; artistName: string }[],
  rosterArtists: readonly { id: string; name: string }[]
): HomeArtistChip[] {
  const byId = new Map<string, string>();

  for (const artist of rosterArtists) {
    if (artist.id) byId.set(artist.id, artist.name);
  }
  for (const release of inFlightReleases) {
    if (release.artistId && !byId.has(release.artistId)) {
      byId.set(release.artistId, release.artistName);
    }
  }

  return Array.from(byId, ([id, name]) => ({ id, name }));
}
