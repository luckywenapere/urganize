// Linking an artist to their streaming profile (Nov 2026, #1088): the pure
// rules. No network and no database, so each is tested directly (rules.test.ts).

import { normalizeName } from '@/lib/code-finder/rules';
import { releaseYmd } from '@/lib/altlink/rules';

export type StreamingLinkState = {
  deezerArtistId: string | null;
  appleArtistId: string | null;
  spotifyArtistId: string | null;
  linkedAt: string | null;
  skippedAt: string | null;
};

export const isLinked = (state: StreamingLinkState): boolean =>
  Boolean(state.deezerArtistId || state.appleArtistId || state.spotifyArtistId);

/**
 * Whether the Home popup should ask about this artist. A linked artist never.
 * An artist marked "Not on streaming yet" only once one of their rollouts has
 * come out after that answer, because by then they are probably on streaming.
 * `releaseDates` are the artist's rollout release days; `today` is YYYY-MM-DD.
 */
export function shouldAskToLink(state: StreamingLinkState, releaseDates: readonly (string | null)[], today: string): boolean {
  if (isLinked(state)) return false;
  if (!state.skippedAt) return true;
  const skippedDay = releaseYmd(state.skippedAt);
  if (!skippedDay) return true;
  return releaseDates.some((date) => {
    const day = releaseYmd(date);
    return Boolean(day && day > skippedDay && day <= today);
  });
}

export type ArtistCandidate = {
  id: string;
  name: string;
  followers: number | null;
};

/**
 * Our best guess for the popup: a result with exactly the artist's name, the
 * one with the most fans when there are several. Null when no name matches, so
 * the popup opens on a search instead of a wrong face.
 */
export function pickSuggestion<T extends ArtistCandidate>(name: string, candidates: readonly T[]): T | null {
  const target = normalizeName(name);
  if (!target) return null;
  const same = candidates.filter((candidate) => normalizeName(candidate.name) === target);
  if (same.length === 0) return null;
  return [...same].sort((a, b) => (b.followers ?? -1) - (a.followers ?? -1))[0];
}

/**
 * Linking the same artist on a second service. Only an exact name counts, and
 * when several share it, only the one that also has a song we know is theirs.
 * Anything less is left unlinked: a wrong link is worse than none.
 */
export function pickSameArtist(
  name: string,
  candidates: readonly { id: string; name: string; songTitles?: readonly string[] }[],
  knownSongTitle: string | null
): string | null {
  const target = normalizeName(name);
  if (!target) return null;
  const same = candidates.filter((candidate) => normalizeName(candidate.name) === target);
  if (same.length === 1) return same[0].id;
  if (same.length === 0 || !knownSongTitle) return null;
  const song = normalizeName(knownSongTitle);
  const withSong = same.filter((candidate) => (candidate.songTitles ?? []).some((title) => normalizeName(title) === song));
  return withSong.length === 1 ? withSong[0].id : null;
}

/** The link route for one artist. */
export const streamingLinkUrl = (artistId: string): string =>
  `/api/workspace/artists/${encodeURIComponent(artistId)}/streaming-link`;
