'use client';

import { useEffect, useMemo } from 'react';
import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { useWorkspaceIdentityStore } from '@/stores/useWorkspaceIdentityStore';
import { readSavedArtistId, useShellStore } from '@/stores/useShellStore';

/**
 * The "which artist am I looking at" view filter that Home and the catalogue
 * read (useShellStore). It used to be the top bar's team and artist switcher,
 * at the top left beside the logo; on 2026-10-11 the founder removed that whole
 * block from the top bar on every screen, so the choice now lives in the
 * account menu on a desktop and in the bottom bar's More sheet on a phone.
 * Nothing is written to the server.
 *
 * `useArtistFilterSync` is the part that has to run on every screen whether a
 * menu is open or not: it loads the team name and roster, restores the saved
 * choice, and drops a saved artist who has left the roster back to "All
 * artists". TopNav calls it once.
 */
export function useArtistFilterSync(): void {
  const loadIdentity = useWorkspaceIdentityStore((state) => state.load);
  const loadRoster = useArtistRosterStore((state) => state.load);
  const artists = useArtistRosterStore((state) => state.artists);
  const rosterLoaded = useArtistRosterStore((state) => state.loaded);
  const selectedArtistId = useShellStore((state) => state.selectedArtistId);
  const hydrateSelectedArtistId = useShellStore((state) => state.hydrateSelectedArtistId);

  useEffect(() => {
    void loadIdentity();
    void loadRoster();
    const saved = readSavedArtistId();
    if (saved !== undefined) hydrateSelectedArtistId(saved);
  }, [loadIdentity, loadRoster, hydrateSelectedArtistId]);

  useEffect(() => {
    if (!rosterLoaded || selectedArtistId === null) return;
    if (!artists.some((artist) => artist.id === selectedArtistId)) {
      hydrateSelectedArtistId(null);
    }
  }, [rosterLoaded, artists, selectedArtistId, hydrateSelectedArtistId]);
}

/** `photoUrl` is the artist's face (null for "All artists" or no photo). */
export type ArtistFilterOption = { id: string | null; name: string; active: boolean; photoUrl: string | null };

/** The choices, "All artists" first, or none when the roster has one artist. */
export function useArtistFilterOptions(): {
  options: ArtistFilterOption[];
  select: (id: string | null) => void;
} {
  const artists = useArtistRosterStore((state) => state.artists);
  const selectedArtistId = useShellStore((state) => state.selectedArtistId);
  const select = useShellStore((state) => state.setSelectedArtistId);
  const options = useMemo(
    () =>
      artists.length > 1
        ? [{ id: null as string | null, name: 'All artists', photoUrl: null as string | null | undefined }, ...artists].map(
            (artist) => ({
              id: artist.id,
              name: artist.name,
              active: artist.id === selectedArtistId,
              photoUrl: artist.photoUrl ?? null,
            })
          )
        : [],
    [artists, selectedArtistId]
  );
  return { options, select };
}
