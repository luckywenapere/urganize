/**
 * Artist import: turn a public music catalogue into an artist and their
 * releases (2026-10-26).
 *
 * Deezer is the first source (no key, no approval, has the release type and
 * the cover). Apple's iTunes lookup is the fallback when Deezer finds nothing
 * or is down. Spotify is deliberately not here: its new-app approval limits
 * could block us at launch.
 *
 * Everything in this file is pure: JSON in, plain objects out. The network
 * calls live in `fetch.ts`, so vitest holds the parsing with fixtures.
 */

export type ImportProvider = 'deezer' | 'itunes';
export type ImportReleaseKind = 'single' | 'ep' | 'album';

export type ImportArtistCandidate = {
  provider: ImportProvider;
  id: string;
  name: string;
  imageUrl: string | null;
  /** Fans (Deezer) or null when the source does not say. */
  followers: number | null;
  genre: string | null;
};

export type ImportRelease = {
  provider: ImportProvider;
  sourceId: string;
  title: string;
  kind: ImportReleaseKind;
  /** YYYY-MM-DD, or null when the source gave none. */
  releaseDate: string | null;
  coverUrl: string | null;
  url: string | null;
};

export const MAX_IMPORT_RELEASES = 100;
export const MAX_IMPORT_CANDIDATES = 5;

const IMPORT_PROVIDERS: readonly string[] = ['deezer', 'itunes'];

export function isImportProvider(value: unknown): value is ImportProvider {
  return typeof value === 'string' && IMPORT_PROVIDERS.includes(value);
}

/** Source ids are plain digits on both providers; anything else is refused. */
export function isSafeSourceId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{1,18}$/.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** "2026-03-07T08:00:00Z" or "2026-03-07" -> "2026-03-07"; anything else null. */
export function normalizeImportDate(value: unknown): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(asString(value));
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1900 || year > 2100) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

// ── Deezer ──────────────────────────────────────────────────────────────────

export function parseDeezerArtists(json: unknown): ImportArtistCandidate[] {
  const data = asRecord(json)?.data;
  if (!Array.isArray(data)) return [];
  const out: ImportArtistCandidate[] = [];
  for (const row of data) {
    const item = asRecord(row);
    if (!item) continue;
    const id = asString(item.id);
    const name = asString(item.name);
    if (!isSafeSourceId(id) || !name) continue;
    out.push({
      provider: 'deezer',
      id,
      name,
      imageUrl: safeUrl(item.picture_medium) ?? safeUrl(item.picture),
      followers: asNumber(item.nb_fan),
      genre: null,
    });
    if (out.length >= MAX_IMPORT_CANDIDATES) break;
  }
  return out;
}

function deezerKind(recordType: string): ImportReleaseKind {
  if (recordType === 'single') return 'single';
  if (recordType === 'ep') return 'ep';
  return 'album';
}

export function parseDeezerAlbums(json: unknown): ImportRelease[] {
  const data = asRecord(json)?.data;
  if (!Array.isArray(data)) return [];
  const out: ImportRelease[] = [];
  for (const row of data) {
    const item = asRecord(row);
    if (!item) continue;
    const sourceId = asString(item.id);
    const title = asString(item.title);
    if (!isSafeSourceId(sourceId) || !title) continue;
    out.push({
      provider: 'deezer',
      sourceId,
      title,
      kind: deezerKind(asString(item.record_type).toLowerCase()),
      releaseDate: normalizeImportDate(item.release_date),
      coverUrl: safeUrl(item.cover_medium) ?? safeUrl(item.cover),
      url: safeUrl(item.link),
    });
  }
  return dedupeReleases(out);
}

// ── Apple iTunes ────────────────────────────────────────────────────────────

export function parseItunesArtists(json: unknown): ImportArtistCandidate[] {
  const results = asRecord(json)?.results;
  if (!Array.isArray(results)) return [];
  const out: ImportArtistCandidate[] = [];
  for (const row of results) {
    const item = asRecord(row);
    if (!item) continue;
    const id = asString(item.artistId);
    const name = asString(item.artistName);
    if (!isSafeSourceId(id) || !name) continue;
    out.push({
      provider: 'itunes',
      id,
      name,
      imageUrl: null,
      followers: null,
      genre: asString(item.primaryGenreName) || null,
    });
    if (out.length >= MAX_IMPORT_CANDIDATES) break;
  }
  return out;
}

/** Apple marks the type in the title ("Slow Burn - EP") and drops it from the kind. */
function itunesKind(title: string, trackCount: number | null): ImportReleaseKind {
  if (/-\s*single$/i.test(title)) return 'single';
  if (/-\s*ep$/i.test(title)) return 'ep';
  if (trackCount !== null) {
    if (trackCount <= 3) return 'single';
    if (trackCount <= 6) return 'ep';
  }
  return 'album';
}

export function cleanItunesTitle(title: string): string {
  return title.replace(/\s*-\s*(single|ep)$/i, '').trim();
}

/** A bigger cover than the 100px one Apple returns. */
export function biggerItunesArtwork(url: string | null): string | null {
  return url ? url.replace(/\/\d+x\d+bb\./, '/300x300bb.') : null;
}

export function parseItunesAlbums(json: unknown): ImportRelease[] {
  const results = asRecord(json)?.results;
  if (!Array.isArray(results)) return [];
  const out: ImportRelease[] = [];
  for (const row of results) {
    const item = asRecord(row);
    if (!item || asString(item.wrapperType) !== 'collection') continue;
    const sourceId = asString(item.collectionId);
    const rawTitle = asString(item.collectionName);
    if (!isSafeSourceId(sourceId) || !rawTitle) continue;
    out.push({
      provider: 'itunes',
      sourceId,
      title: cleanItunesTitle(rawTitle),
      kind: itunesKind(rawTitle, asNumber(item.trackCount)),
      releaseDate: normalizeImportDate(item.releaseDate),
      coverUrl: biggerItunesArtwork(safeUrl(item.artworkUrl100)),
      url: safeUrl(item.collectionViewUrl),
    });
  }
  return dedupeReleases(out);
}

// ── Shared ──────────────────────────────────────────────────────────────────

function titleKey(release: ImportRelease): string {
  return `${release.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${release.kind}`;
}

/**
 * Newest first, one row per title and kind (a platform lists the same song
 * again as a deluxe or a re-issue), capped. The newest copy wins.
 */
export function dedupeReleases(releases: readonly ImportRelease[]): ImportRelease[] {
  const sorted = [...releases].sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
  const seen = new Set<string>();
  const out: ImportRelease[] = [];
  for (const release of sorted) {
    const key = titleKey(release);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(release);
    if (out.length >= MAX_IMPORT_RELEASES) break;
  }
  return out;
}

const MONTH_MS = 30.4375 * 24 * 60 * 60 * 1000;

/**
 * The nudge on the last screen: how long since the newest release, and the
 * artist's usual gap between releases. Null when there is not enough to say.
 */
export function describeCadence(
  releases: readonly ImportRelease[],
  now: number = Date.now()
): { latestTitle: string; monthsSince: number; usualGapMonths: number | null } | null {
  const dated = releases
    .filter((release) => release.releaseDate)
    .map((release) => ({ title: release.title, at: Date.parse(`${release.releaseDate}T00:00:00Z`) }))
    .filter((release) => Number.isFinite(release.at))
    .sort((a, b) => b.at - a.at);
  if (dated.length === 0) return null;
  const monthsSince = Math.max(0, Math.round((now - dated[0].at) / MONTH_MS));
  let usualGapMonths: number | null = null;
  if (dated.length >= 3) {
    const gaps: number[] = [];
    for (let i = 0; i < dated.length - 1 && i < 6; i++) gaps.push((dated[i].at - dated[i + 1].at) / MONTH_MS);
    gaps.sort((a, b) => a - b);
    const median = gaps[Math.floor(gaps.length / 2)];
    usualGapMonths = Math.max(1, Math.round(median));
  }
  return { latestTitle: dated[0].title, monthsSince, usualGapMonths };
}
