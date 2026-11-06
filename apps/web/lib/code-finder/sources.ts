// Finding a released song's UPC and ISRC: the two streaming lookups. Server only.
//
// Deezer first: its public API needs no account and returns the ISRC on a track
// and the UPC on an album. Spotify second, only when Deezer finds nothing usable
// and SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are set (a free developer app,
// client credentials). Every request has a short timeout and every failure is
// "nothing found", so a slow service can never hold Home up.

import { normalizeIsrc, normalizeUpc, releaseYmd } from '@/lib/altlink/rules';
import { normalizeName, preferredKind, titleScore, artistScore, type CodeCandidate, type CodeTarget } from './rules';
import { fetchDeezerCodes, fetchImportReleases } from '@/lib/artist-import/fetch';

type FetchLike = typeof fetch;

const TIMEOUT_MS = 6000;
/** Details (the codes) are fetched for this many of the best-looking results. */
const DETAIL_LIMIT = 3;

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

async function getJson(fetchImpl: FetchLike, url: string, init: RequestInit = {}): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Ranks raw search rows by title and artist only, so details are fetched for the likeliest. */
function shortlist<T>(rows: T[], target: CodeTarget, read: (row: T) => { title: string; artist: string }): T[] {
  return rows
    .map((row) => {
      const { title, artist } = read(row);
      return { row, score: titleScore(target.title, title) + artistScore(target.artistName, artist) };
    })
    .filter((entry) => entry.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, DETAIL_LIMIT)
    .map((entry) => entry.row);
}

const quote = (value: string) => `"${value.replace(/"/g, '')}"`;

// ── Deezer ──────────────────────────────────────────────────────────────────

const DEEZER = 'https://api.deezer.com';

type DeezerRow = Record<string, unknown> & { id?: unknown; title?: unknown; artist?: { name?: unknown } };

const deezerArtist = (row: Record<string, unknown>): string =>
  text((row.artist as Record<string, unknown> | undefined)?.name) ?? '';

export async function searchDeezer(target: CodeTarget, fetchImpl: FetchLike = fetch): Promise<CodeCandidate[]> {
  const kind = preferredKind(target.releaseType);
  const field = kind === 'album' ? 'album' : 'track';
  const q = `artist:${quote(target.artistName)} ${field}:${quote(target.title)}`;
  const search = await getJson(fetchImpl, `${DEEZER}/search/${kind}?q=${encodeURIComponent(q)}&limit=10`);
  let rows = (Array.isArray(search?.data) ? search.data : []) as DeezerRow[];
  if (rows.length === 0) {
    // The strict search misses a title with an odd spelling; a loose one catches it.
    const loose = await getJson(
      fetchImpl,
      `${DEEZER}/search/${kind}?q=${encodeURIComponent(`${target.artistName} ${target.title}`)}&limit=10`
    );
    rows = (Array.isArray(loose?.data) ? loose.data : []) as DeezerRow[];
  }
  const picked = shortlist(rows, target, (row) => ({ title: text(row.title) ?? '', artist: deezerArtist(row) }));

  const out: CodeCandidate[] = [];
  for (const row of picked) {
    const id = text(String(row.id ?? ''));
    if (!id) continue;
    if (kind === 'track') {
      const track = await getJson(fetchImpl, `${DEEZER}/track/${id}`);
      if (!track) continue;
      const album = track.album as Record<string, unknown> | undefined;
      const albumId = text(String(album?.id ?? ''));
      const albumBody = albumId ? await getJson(fetchImpl, `${DEEZER}/album/${albumId}`) : null;
      out.push({
        source: 'deezer',
        id,
        kind: 'track',
        title: text(track.title) ?? '',
        artist: deezerArtist(track),
        releaseDate: releaseYmd(text(track.release_date)) ?? releaseYmd(text(albumBody?.release_date)),
        isrc: normalizeIsrc(track.isrc),
        upc: normalizeUpc(albumBody?.upc),
        coverUrl: text(album?.cover_xl) ?? text(album?.cover_big) ?? text(album?.cover_medium),
        url: text(track.link),
      });
    } else {
      const album = await getJson(fetchImpl, `${DEEZER}/album/${id}`);
      if (!album) continue;
      const tracks = (album.tracks as Record<string, unknown> | undefined)?.data;
      const firstTrackId = Array.isArray(tracks) ? text(String((tracks[0] as Record<string, unknown>)?.id ?? '')) : null;
      const firstTrack = firstTrackId ? await getJson(fetchImpl, `${DEEZER}/track/${firstTrackId}`) : null;
      out.push({
        source: 'deezer',
        id,
        kind: 'album',
        title: text(album.title) ?? '',
        artist: deezerArtist(album),
        releaseDate: releaseYmd(text(album.release_date)),
        upc: normalizeUpc(album.upc),
        isrc: normalizeIsrc(firstTrack?.isrc),
        coverUrl: text(album.cover_xl) ?? text(album.cover_big) ?? text(album.cover_medium),
        url: text(album.link),
      });
    }
  }
  return out;
}

// ── Spotify ─────────────────────────────────────────────────────────────────

const SPOTIFY_API = 'https://api.spotify.com/v1';

export const isSpotifyConfigured = (env: Record<string, string | undefined> = process.env): boolean =>
  Boolean(env.SPOTIFY_CLIENT_ID?.trim() && env.SPOTIFY_CLIENT_SECRET?.trim());

let cachedToken: { value: string; expiresAt: number } | null = null;

async function spotifyToken(fetchImpl: FetchLike): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const id = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  const body = await getJson(fetchImpl, 'https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const token = text(body?.access_token);
  if (!token) return null;
  const seconds = typeof body?.expires_in === 'number' ? body.expires_in : 3600;
  cachedToken = { value: token, expiresAt: Date.now() + seconds * 1000 };
  return token;
}

/** For tests. */
export function resetSpotifyToken() {
  cachedToken = null;
}

/** One Spotify Web API read with the app's token. Null when Spotify is not set up or did not answer. */
export async function spotifyGet(path: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown> | null> {
  if (!isSpotifyConfigured()) return null;
  const token = await spotifyToken(fetchImpl);
  if (!token) return null;
  return getJson(fetchImpl, `${SPOTIFY_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

const spotifyArtists = (row: Record<string, unknown>): string =>
  (Array.isArray(row.artists) ? row.artists : [])
    .map((artist) => text((artist as Record<string, unknown>)?.name))
    .filter(Boolean)
    .join(', ');

const spotifyCover = (album: Record<string, unknown> | undefined): string | null => {
  const images = album?.images;
  return Array.isArray(images) ? text((images[0] as Record<string, unknown>)?.url) : null;
};

export async function searchSpotify(target: CodeTarget, fetchImpl: FetchLike = fetch): Promise<CodeCandidate[]> {
  if (!isSpotifyConfigured()) return [];
  const token = await spotifyToken(fetchImpl);
  if (!token) return [];
  const headers = { Authorization: `Bearer ${token}` };
  const kind = preferredKind(target.releaseType);
  const field = kind === 'album' ? 'album' : 'track';
  const q = `${field}:${normalizeName(target.title)} artist:${normalizeName(target.artistName)}`;
  const search = await getJson(fetchImpl, `${SPOTIFY_API}/search?type=${kind}&limit=10&q=${encodeURIComponent(q)}`, { headers });
  const bucket = (search?.[`${kind}s`] as Record<string, unknown> | undefined)?.items;
  const rows = (Array.isArray(bucket) ? bucket : []) as Record<string, unknown>[];
  const picked = shortlist(rows, target, (row) => ({ title: text(row.name) ?? '', artist: spotifyArtists(row) }));
  if (picked.length === 0) return [];

  const albumIds = picked
    .map((row) => (kind === 'album' ? text(row.id) : text((row.album as Record<string, unknown> | undefined)?.id)))
    .filter((id): id is string => Boolean(id));
  const albums = await getJson(fetchImpl, `${SPOTIFY_API}/albums?ids=${albumIds.join(',')}`, { headers });
  const albumById = new Map<string, Record<string, unknown>>();
  for (const album of (Array.isArray(albums?.albums) ? albums.albums : []) as Record<string, unknown>[]) {
    const id = text(album?.id);
    if (id) albumById.set(id, album);
  }

  return picked.flatMap((row): CodeCandidate[] => {
    const id = text(row.id);
    if (!id) return [];
    const album = kind === 'album' ? albumById.get(id) : albumById.get(text((row.album as Record<string, unknown>)?.id) ?? '');
    const external = (row.external_ids ?? {}) as Record<string, unknown>;
    const albumExternal = (album?.external_ids ?? {}) as Record<string, unknown>;
    const firstTrack = kind === 'album' ? ((album?.tracks as Record<string, unknown> | undefined)?.items as unknown[] | undefined)?.[0] : null;
    return [
      {
        source: 'spotify',
        id,
        kind,
        title: text(row.name) ?? '',
        artist: spotifyArtists(row),
        releaseDate: releaseYmd(text(album?.release_date) ?? text((row.album as Record<string, unknown> | undefined)?.release_date)),
        isrc: normalizeIsrc(kind === 'track' ? external.isrc : ((firstTrack as Record<string, unknown> | undefined)?.external_ids as Record<string, unknown> | undefined)?.isrc),
        upc: normalizeUpc(albumExternal.upc),
        coverUrl: spotifyCover(album ?? (row.album as Record<string, unknown> | undefined)),
        url: text((row.external_urls as Record<string, unknown> | undefined)?.spotify),
      },
    ];
  });
}

// ── A linked artist (#1088) ─────────────────────────────────────────────────

/**
 * The song looked up inside the artist's own Deezer page, never by name, so a
 * fan's upload or another artist with the same name cannot be found. Up to
 * three releases whose title matches get their codes read.
 */
export async function searchLinkedDeezer(target: CodeTarget, deezerArtistId: string): Promise<CodeCandidate[]> {
  const releases = (await fetchImportReleases('deezer', deezerArtistId)) ?? [];
  const matching = releases
    .map((release) => ({ release, score: titleScore(target.title, release.title) }))
    .filter((entry) => entry.score >= 0.8)
    .sort((a, b) => b.score - a.score)
    .slice(0, DETAIL_LIMIT);
  const out: CodeCandidate[] = [];
  for (const { release } of matching) {
    const codes = await fetchDeezerCodes(release.sourceId, release.kind);
    if (!codes) continue;
    out.push({
      source: 'deezer',
      id: release.sourceId,
      kind: release.kind === 'single' ? 'track' : 'album',
      title: release.title,
      artist: target.artistName,
      releaseDate: release.releaseDate,
      upc: normalizeUpc(codes.upc),
      isrc: normalizeIsrc(codes.isrc),
      coverUrl: release.coverUrl,
      url: release.url,
    });
  }
  return out;
}

/** The same, inside the artist's own Spotify page, when Spotify is set up. */
export async function searchLinkedSpotify(target: CodeTarget, spotifyArtistId: string): Promise<CodeCandidate[]> {
  if (!/^[A-Za-z0-9]{1,64}$/.test(spotifyArtistId)) return [];
  const list = await spotifyGet(`/artists/${spotifyArtistId}/albums?include_groups=album,single&limit=50`);
  const items = (Array.isArray(list?.items) ? list.items : []) as Record<string, unknown>[];
  const ids = items
    .filter((album) => titleScore(target.title, text(album.name) ?? '') >= 0.8)
    .slice(0, DETAIL_LIMIT)
    .map((album) => text(album.id))
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  const albums = await spotifyGet(`/albums?ids=${ids.join(',')}`);
  return ((Array.isArray(albums?.albums) ? albums.albums : []) as Record<string, unknown>[]).flatMap((album): CodeCandidate[] => {
    const id = text(album.id);
    if (!id) return [];
    const type = text(album.album_type);
    return [
      {
        source: 'spotify',
        id,
        kind: type === 'single' && preferredKind(target.releaseType) === 'track' ? 'track' : 'album',
        title: text(album.name) ?? '',
        artist: target.artistName,
        releaseDate: releaseYmd(text(album.release_date)),
        upc: normalizeUpc(((album.external_ids ?? {}) as Record<string, unknown>).upc),
        isrc: null,
        coverUrl: spotifyCover(album),
        url: text((album.external_urls as Record<string, unknown> | undefined)?.spotify),
      },
    ];
  });
}
