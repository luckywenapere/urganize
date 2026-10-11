'use client';

import { useArtistRosterStore } from '@/stores/useArtistRosterStore';
import { ProfileFace } from './ProfileFace';

/**
 * An artist's roster face by id, for places that only hold a release (rollout
 * headers). Reads the roster store, which carries signed photo urls; renders
 * nothing for a rollout with no artist so "Unassigned artist" stays plain.
 */
export function ArtistFace({
  artistId,
  name,
  size = 20,
  className = '',
}: {
  artistId: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const photoUrl = useArtistRosterStore(
    (state) => state.artists.find((artist) => artist.id === artistId)?.photoUrl ?? null
  );
  if (!artistId || !name) return null;
  return <ProfileFace name={name} photoUrl={photoUrl} size={size} className={className} />;
}
