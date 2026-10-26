/**
 * The network side of the artist import. Server only: the browser never talks
 * to Deezer or Apple, so there is no key to hide and no CORS to fight, and a
 * result can be cached for everyone who types the same name.
 */

import {
  dedupeReleases,
  isSafeSourceId,
  parseDeezerAlbums,
  parseDeezerArtists,
  parseItunesAlbums,
  parseItunesArtists,
  type ImportArtistCandidate,
  type ImportProvider,
  type ImportRelease,
} from './providers';

const TIMEOUT_MS = 6000;

async function getJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json', 'User-Agent': 'Urganize/1.0 (artist import)' },
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** Matching profiles for a typed name. Deezer first, Apple when Deezer has none. */
export async function searchImportArtists(query: string): Promise<ImportArtistCandidate[]> {
  const q = query.trim().slice(0, 80);
  if (q.length < 2) return [];
  const encoded = encodeURIComponent(q);

  const deezer = parseDeezerArtists(await getJson(`https://api.deezer.com/search/artist?q=${encoded}&limit=8`));
  if (deezer.length > 0) return deezer;

  return parseItunesArtists(
    await getJson(`https://itunes.apple.com/search?term=${encoded}&entity=musicArtist&limit=8`)
  );
}

/** One artist's releases, newest first. Null means the source could not be reached. */
export async function fetchImportReleases(
  provider: ImportProvider,
  id: string
): Promise<ImportRelease[] | null> {
  if (!isSafeSourceId(id)) return null;
  if (provider === 'deezer') {
    const json = await getJson(`https://api.deezer.com/artist/${id}/albums?limit=100`);
    return json === null ? null : dedupeReleases(parseDeezerAlbums(json));
  }
  const json = await getJson(`https://itunes.apple.com/lookup?id=${id}&entity=album&limit=200`);
  return json === null ? null : dedupeReleases(parseItunesAlbums(json));
}
