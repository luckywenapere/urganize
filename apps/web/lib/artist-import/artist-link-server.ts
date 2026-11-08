/**
 * "Paste their link" (Nov 2026, #1129): the network side. Server only, like
 * `fetch.ts`: the browser sends what was pasted, and only Deezer and Apple are
 * ever called, by an id read from the link. A Deezer share link is opened
 * one redirect at a time, and only while it stays on Deezer.
 */

import {
  artistLinkMessage,
  isDeezerHost,
  isDeezerShortHost,
  LINK_UNREACHABLE,
  parseArtistLink,
  type ArtistLink,
} from './artist-link';
import { parseDeezerArtists, parseItunesArtists, type ImportArtistCandidate } from './providers';

type FetchLike = typeof fetch;
type OpenedLink = Exclude<ArtistLink, { kind: 'short' }>;

const TIMEOUT_MS = 6000;
/** Share links redirect once or twice. Anything longer is not a share link. */
const MAX_HOPS = 4;
const MAX_PAGE_CHARS = 200_000;
const HEADERS = { Accept: 'application/json', 'User-Agent': 'Urganize/1.0 (artist link)' };
const UNREACHABLE = LINK_UNREACHABLE;
/** Deezer's "no data" error: the artist does not exist. Its other errors (quota, outage) mean try again. */
const DEEZER_NO_DATA = 800;

export type ArtistLinkResult =
  | { ok: true; candidate: ImportArtistCandidate }
  | { ok: false; status: 422 | 502; message: string };

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: HEADERS,
      next: { revalidate: 3600 },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** The page a share link's own page says it is, for when it answers with a page instead of a redirect. */
function pageAddress(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i,
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(html)?.[1];
    if (found) return found;
  }
  return null;
}

/** Read a deezer.com address. Anything off Deezer is not trusted. */
function readDeezerPage(address: string, base: string): OpenedLink {
  let url: URL;
  try {
    url = new URL(address, base);
  } catch {
    return { kind: 'broken' };
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !isDeezerHost(url.hostname)) return { kind: 'broken' };
  const parsed = parseArtistLink(url.toString());
  return parsed && parsed.kind !== 'short' ? parsed : { kind: 'broken' };
}

/**
 * Where a Deezer share link goes. Null means Deezer did not answer, so the
 * person is told to try again rather than to check the link.
 */
export async function openShortLink(shortUrl: string, fetchImpl: FetchLike = fetch): Promise<OpenedLink | null> {
  let current = shortUrl;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'User-Agent': HEADERS['User-Agent'] },
        cache: 'no-store',
      });
    } catch {
      return null;
    }

    if (response.status >= 300 && response.status < 400) {
      // Only the address is needed; let the connection go.
      await response.body?.cancel().catch(() => undefined);
      const location = response.headers.get('location');
      if (!location) return { kind: 'broken' };
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return { kind: 'broken' };
      }
      if ((next.protocol === 'https:' || next.protocol === 'http:') && isDeezerShortHost(next.hostname)) {
        current = next.toString();
        continue;
      }
      return readDeezerPage(next.toString(), current);
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return response.status >= 500 ? null : { kind: 'broken' };
    }
    const html = (await response.text().catch(() => '')).slice(0, MAX_PAGE_CHARS);
    const address = pageAddress(html);
    return address ? readDeezerPage(address, current) : { kind: 'broken' };
  }
  return { kind: 'broken' };
}

/** A Deezer artist by id. Null: Deezer did not answer. 'missing': no such artist. */
async function deezerArtist(id: string, fetchImpl: FetchLike): Promise<ImportArtistCandidate | 'missing' | null> {
  const body = await getJson(fetchImpl, `https://api.deezer.com/artist/${id}`);
  if (body === null) return null;
  if (!body || typeof body !== 'object') return 'missing';
  if ('error' in body) {
    const code = (body.error as { code?: unknown } | null)?.code;
    return code === DEEZER_NO_DATA ? 'missing' : null;
  }
  return parseDeezerArtists({ data: [body] })[0] ?? 'missing';
}

/** Only an artist row counts: an album or song id would give the album's artist, not the one linked. */
function appleArtistRow(body: unknown): ImportArtistCandidate | null {
  const results = (body as { results?: unknown } | null)?.results;
  const artists = (Array.isArray(results) ? results : []).filter(
    (row) => (row as { wrapperType?: unknown } | null)?.wrapperType === 'artist'
  );
  return parseItunesArtists({ results: artists })[0] ?? null;
}

/**
 * An Apple Music artist by id. Apple's lookup reads the US store unless told
 * otherwise, so an artist only in the link's own store is looked up there next.
 */
async function appleArtist(
  id: string,
  country: string | null,
  fetchImpl: FetchLike
): Promise<ImportArtistCandidate | 'missing' | null> {
  const body = await getJson(fetchImpl, `https://itunes.apple.com/lookup?id=${id}`);
  if (body === null) return null;
  const found = appleArtistRow(body);
  if (found) return found;
  if (!country || country === 'us') return 'missing';
  const local = await getJson(fetchImpl, `https://itunes.apple.com/lookup?id=${id}&country=${country}`);
  if (local === null) return null;
  return appleArtistRow(local) ?? 'missing';
}

/** The artist a pasted link points at, ready for the same check screen a search result opens. */
export async function findArtistFromLink(input: string, fetchImpl: FetchLike = fetch): Promise<ArtistLinkResult> {
  const parsed = parseArtistLink(input);
  if (!parsed) return { ok: false, status: 422, message: artistLinkMessage({ kind: 'unknown' }) };

  let link: OpenedLink;
  if (parsed.kind === 'short') {
    const opened = await openShortLink(parsed.url, fetchImpl);
    if (!opened) return { ok: false, status: 502, message: UNREACHABLE };
    link = opened;
  } else {
    link = parsed;
  }
  if (link.kind !== 'artist') return { ok: false, status: 422, message: artistLinkMessage(link) };

  const candidate =
    link.provider === 'deezer'
      ? await deezerArtist(link.id, fetchImpl)
      : await appleArtist(link.id, link.country, fetchImpl);
  if (candidate === null) return { ok: false, status: 502, message: UNREACHABLE };
  if (candidate === 'missing') return { ok: false, status: 422, message: artistLinkMessage({ kind: 'broken' }) };
  return { ok: true, candidate };
}
