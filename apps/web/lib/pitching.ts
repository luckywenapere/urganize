/**
 * Playlist pitching — client-safe constants and pure logic, imported by both
 * the pitching UI and the API routes so the two can never disagree about a
 * limit, a label or what counts as a valid song link (the asset-constants.ts
 * pattern). No node-only imports.
 */

import type { PitchPlatform, PitchStatus } from '@/types/pitching';

/**
 * The spam brake: how many pitches may be waiting on a reply per release.
 * Config value on purpose — the founder should be able to move it without
 * touching logic. Enforced in POST /api/pitching/pitches and mirrored in the
 * composer's disabled state, and backed by a partial index in the migration.
 */
export const MAX_WAITING_PITCHES_PER_RELEASE = 10;

/** Pitch note cap. Short by design: a curator reads dozens of these. */
export const MAX_PITCH_NOTE_LENGTH = 300;

/** Curator reply cap. One line, not a conversation. */
export const MAX_PITCH_REPLY_LENGTH = 200;

export const MAX_SONG_TITLE_LENGTH = 200;
export const MAX_SONG_URL_LENGTH = 500;
export const MAX_PLAYLIST_NAME_LENGTH = 120;
export const MAX_PLAYLIST_URL_LENGTH = 500;
export const MAX_CURATOR_DISPLAY_NAME_LENGTH = 80;
export const MAX_CURATOR_BIO_LENGTH = 500;

/**
 * Size ceiling for a curator's profile photo.
 *
 * Its OWN number, deliberately not `ASSET_SIZE_LIMITS.cover_art`, which the
 * photo route used to borrow. That coupling broke the moment cover art was
 * raised to 25 MiB to fit the square 3000x3000 image DSPs require: an avatar
 * rendered at 64px silently started accepting a 25 MiB upload. The two have no
 * reason to move together — one is a distributor deliverable, the other is a
 * thumbnail beside a playlist name — so they no longer share a constant.
 *
 * The MIME allowlist is still shared with cover art (both are just "an image
 * we can display"), which is fine: adding a format there is not a size change.
 */
export const MAX_CURATOR_PHOTO_BYTES = 5 * 1024 * 1024;

/** Genre tags per playlist, and the length of one tag. */
export const MAX_PLAYLIST_GENRES = 10;
export const MAX_GENRE_TAG_LENGTH = 30;

export const PITCH_PLATFORMS: PitchPlatform[] = [
  'spotify',
  'apple_music',
  'audiomack',
  'youtube',
  'other',
];

export const PITCH_PLATFORM_LABELS: Record<PitchPlatform, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  audiomack: 'Audiomack',
  youtube: 'YouTube',
  other: 'Other',
};

export const PITCH_STATUSES: PitchStatus[] = ['new', 'listened', 'added', 'passed'];

export const PITCH_STATUS_LABELS: Record<PitchStatus, string> = {
  new: 'New',
  listened: 'Listened',
  added: 'Added',
  passed: 'Passed',
};

/**
 * Statuses that carry an optional reply. Moving to anything else clears the
 * reply, so a card can never show an answer that no longer matches its status.
 */
export const REPLYABLE_PITCH_STATUSES: PitchStatus[] = ['added', 'passed'];

export const isPitchPlatform = (value: unknown): value is PitchPlatform =>
  typeof value === 'string' && (PITCH_PLATFORMS as string[]).includes(value);

export const isPitchStatus = (value: unknown): value is PitchStatus =>
  typeof value === 'string' && (PITCH_STATUSES as string[]).includes(value);

export const acceptsPitchReply = (status: PitchStatus): boolean =>
  REPLYABLE_PITCH_STATUSES.includes(status);

/**
 * A song link may point anywhere: untitled.stream, SoundCloud, a private Drive
 * link, or a live DSP page. So the only rule is that it parses as an http(s)
 * URL with a host. Anything stricter would reject the private-link case the
 * feature exists to serve.
 */
export function isValidSongUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_SONG_URL_LENGTH) return false;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return Boolean(parsed.hostname);
}

// Hostname suffixes we recognize. Matched as suffixes so subdomains work:
// open.spotify.com, m.youtube.com, music.apple.com all resolve.
const PLATFORM_HOSTS: Array<{ suffix: string; platform: PitchPlatform }> = [
  { suffix: 'spotify.com', platform: 'spotify' },
  { suffix: 'spotify.link', platform: 'spotify' },
  { suffix: 'music.apple.com', platform: 'apple_music' },
  { suffix: 'apple.co', platform: 'apple_music' },
  { suffix: 'audiomack.com', platform: 'audiomack' },
  { suffix: 'youtube.com', platform: 'youtube' },
  { suffix: 'youtu.be', platform: 'youtube' },
  { suffix: 'youtube-nocookie.com', platform: 'youtube' },
];

/**
 * Best-effort platform read from a link's hostname, for the small label next to
 * the URL field. Returns null when the host is unrecognized — deliberately not
 * 'other', so the UI can say nothing rather than assert something wrong. A
 * private or unreleased link is the normal case, not an error.
 */
export function detectPitchPlatform(value: unknown): PitchPlatform | null {
  if (!isValidSongUrl(value)) return null;
  let host: string;
  try {
    host = new URL(value.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host.startsWith('www.')) host = host.slice(4);
  for (const entry of PLATFORM_HOSTS) {
    if (host === entry.suffix || host.endsWith(`.${entry.suffix}`)) {
      return entry.platform;
    }
  }
  return null;
}

/**
 * Normalizes a curator's genre tags: trimmed, lowercased, deduped, capped in
 * both tag length and count. Lowercasing is what makes the pitcher-side genre
 * filter work across curators who type "Afrobeats" and "afrobeats".
 */
export function normalizeGenreTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim().toLowerCase().slice(0, MAX_GENRE_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length >= MAX_PLAYLIST_GENRES) break;
  }
  return tags;
}

/**
 * Self-reported follower count for display: "12.4k", "1.2m". Returns '' for
 * null so callers can decide their own placeholder.
 */
export function formatFollowerCount(count: number | null | undefined): string {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return '';
  if (count < 1_000) return String(Math.floor(count));
  if (count < 1_000_000) {
    const thousands = count / 1_000;
    return `${thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, '') : Math.floor(thousands)}k`;
  }
  const millions = count / 1_000_000;
  return `${millions < 10 ? millions.toFixed(1).replace(/\.0$/, '') : Math.floor(millions)}m`;
}

/** How many of these pitches are still waiting on a reply. */
export const countWaitingPitches = (statuses: Array<{ status: PitchStatus }>): number =>
  statuses.filter((entry) => entry.status === 'new').length;
