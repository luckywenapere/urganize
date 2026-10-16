import type { BrowsablePlaylist } from '@/types/pitching';

// One face per curator in Pitch this! (2026-10-16). The playlist route answers
// playlists; the grid shows people, each holding their playlists.

export type CuratorGroup = {
  key: string;
  curatorName: string;
  photoUrl: string | null;
  playlists: BrowsablePlaylist[];
};

/**
 * Group playlists by curator, keeping the route's order (first seen first).
 * The route carries no curator id, so the name is the key; a curator's
 * playlists all carry the same name and photo.
 */
export function groupPlaylistsByCurator(playlists: readonly BrowsablePlaylist[]): CuratorGroup[] {
  const groups = new Map<string, CuratorGroup>();
  for (const playlist of playlists) {
    const name = (playlist.curatorName || 'Curator').trim();
    const key = name.toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.playlists.push(playlist);
      if (!existing.photoUrl && playlist.curatorPhotoUrl) existing.photoUrl = playlist.curatorPhotoUrl;
    } else {
      groups.set(key, { key, curatorName: name, photoUrl: playlist.curatorPhotoUrl || null, playlists: [playlist] });
    }
  }
  return [...groups.values()];
}
