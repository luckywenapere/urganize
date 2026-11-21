/**
 * Urganize music: the rules that decide what a listener may hear.
 *
 * Pure on purpose (no React, no I/O, no environment reads) so vitest can hold
 * every one of them. The routes and the screens call these and add nothing of
 * their own to the decisions.
 *
 * The product shape (founder, 2026-11-21): artists and their teams upload a song
 * from a rollout and publish it; anyone, signed in or not, opens the music side
 * and listens to full songs, newest first. Plays are counted for the artist.
 */

import { ASSET_SIZE_LIMITS, formatFileSize } from '../asset-constants';

/** MP3 and WAV only. FLAC is in the old audio allow-list; the music side leaves
 *  it out because Safari support is patchy and the founder named two formats. */
export const MUSIC_MIME_TYPES: readonly string[] = ['audio/mpeg', 'audio/wav', 'audio/x-wav'];

/** The same 40 MiB the storage plan allows per upload (lib/asset-constants.ts). */
export const MUSIC_MAX_BYTES: number = ASSET_SIZE_LIMITS.audio;

/** Longest song we will record a length for. A longer hint is dropped, not an error. */
export const MUSIC_MAX_SECONDS = 60 * 60;

export const MUSIC_FILE_ACCEPT = '.mp3,.wav,audio/mpeg,audio/wav,audio/x-wav';

export const MUSIC_FORMATS_LABEL = 'MP3 or WAV';

/** How many plays one listener adds to one song inside this window. Keeps a song
 *  left on repeat, or a refreshed page, from inflating the artist's number. */
export const PLAY_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/** How long a listener has to hear a song before it counts as a play. */
export const PLAY_COUNT_AFTER_SECONDS = 30;

/** Lagos is UTC+1 all year, so a release date goes live at 00:00 +01:00. */
const LAGOS_OFFSET = '+01:00';

export type MusicLiveMode = 'release_day' | 'now';

export function isMusicLiveMode(value: unknown): value is MusicLiveMode {
  return value === 'release_day' || value === 'now';
}

export type MusicFileCheck = { ok: true } | { ok: false; error: string };

export function validateMusicFile(file: { name: string; type: string; size: number }): MusicFileCheck {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: 'That file is empty.' };
  }
  if (file.size > MUSIC_MAX_BYTES) {
    return {
      ok: false,
      error: `That song is ${formatFileSize(file.size)}. The most we can take is ${formatFileSize(MUSIC_MAX_BYTES)}.`,
    };
  }
  if (!MUSIC_MIME_TYPES.includes((file.type || '').toLowerCase())) {
    return { ok: false, error: `That is not a song we can take. Use ${MUSIC_FORMATS_LABEL}.` };
  }
  return { ok: true };
}

/** A length in whole seconds from whatever the browser or a request gave us, or
 *  null. A bad hint is never an error: the song still uploads, it just shows no
 *  length. */
export function parseDurationSeconds(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const seconds = Math.round(n);
  if (seconds < 1 || seconds > MUSIC_MAX_SECONDS) return null;
  return seconds;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`;
}

export type LiveInput = {
  liveMode: MusicLiveMode;
  publishedAt: string | null;
  takenDownAt: string | null;
};

export type LiveRelease = {
  releaseDate: string | null;
  deletedAt: string | null;
};

/**
 * The moment a published song becomes audible, in milliseconds, or null when it
 * has no moment yet.
 *
 * `now` goes live the instant it is published. `release_day` goes live at the
 * start of the release date in Lagos; with no date set it has no moment, so the
 * song waits instead of going out early. Computed from the release's CURRENT
 * date, never stored, so moving the release date moves the song with it.
 */
export function trackLiveAt(track: LiveInput, release: LiveRelease): number | null {
  if (!track.publishedAt) return null;
  const published = Date.parse(track.publishedAt);
  if (!Number.isFinite(published)) return null;
  if (track.liveMode === 'now') return published;
  if (!release.releaseDate) return null;
  const date = release.releaseDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const at = Date.parse(`${date}T00:00:00${LAGOS_OFFSET}`);
  return Number.isFinite(at) ? at : null;
}

/** Whether a listener may hear it right now. Failing toward silence: any piece
 *  of doubt (no publish, taken down, a trashed rollout, a date in the future)
 *  answers no. */
export function isTrackLive(track: LiveInput, release: LiveRelease, nowMs: number): boolean {
  if (track.takenDownAt) return false;
  if (release.deletedAt) return false;
  const at = trackLiveAt(track, release);
  return at !== null && at <= nowMs;
}

export type TrackStatus = 'draft' | 'scheduled' | 'live' | 'taken_down';

/** What the artist sees on a song: not published, waiting for its day, out, or
 *  taken down. A rollout in the trash reads as taken down. */
export function trackStatus(track: LiveInput, release: LiveRelease, nowMs: number): TrackStatus {
  if (track.takenDownAt || release.deletedAt) return 'taken_down';
  if (!track.publishedAt) return 'draft';
  return isTrackLive(track, release, nowMs) ? 'live' : 'scheduled';
}

export type TrackForSearch = { title: string; artistName: string };

function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every word typed has to appear in the title or the artist, in any order.
 *  An empty query matches everything. */
export function matchesMusicQuery(track: TrackForSearch, query: string): boolean {
  const words = normalise(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalise(`${track.title} ${track.artistName}`);
  return words.every((word) => haystack.includes(word));
}

export type ArtistHit = { name: string; songs: number };

/** The artists behind a set of songs, most songs first, ties by name. */
export function artistsFromTracks(tracks: readonly { artistName: string }[]): ArtistHit[] {
  const counts = new Map<string, ArtistHit>();
  for (const track of tracks) {
    const key = normalise(track.artistName);
    if (!key) continue;
    const hit = counts.get(key);
    if (hit) hit.songs += 1;
    else counts.set(key, { name: track.artistName.trim(), songs: 1 });
  }
  return Array.from(counts.values()).sort(
    (a, b) => b.songs - a.songs || a.name.localeCompare(b.name)
  );
}

/** Whether this listener's play should be written, given the time of their last
 *  one on the same song (or null for none). Unreadable input counts: a lost play
 *  is worse for the artist than one extra. */
export function shouldCountPlay(lastPlayAtMs: number | null, nowMs: number): boolean {
  if (lastPlayAtMs === null || !Number.isFinite(lastPlayAtMs)) return true;
  return nowMs - lastPlayAtMs >= PLAY_DEDUPE_WINDOW_MS;
}

/** The two-letter tile shown when a song has no cover. */
export function musicInitials(title: string): string {
  const words = title
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export type MusicGuidance = 'team' | 'curator' | 'both' | null;

/**
 * Which "your things moved" card a signed-in person sees on the song list.
 * Everyone who already used Urganize used to land on their rollouts or their
 * pitches; they now land here, so the card says where those went. A listener
 * with no team and no playlists sees nothing. Dismissed means nothing, always.
 */
export function musicGuidance(input: {
  isAuthenticated: boolean;
  role: string | null | undefined;
  hasCuratorProfile: boolean | null;
  dismissed: boolean;
}): MusicGuidance {
  if (!input.isAuthenticated || input.dismissed) return null;
  const curatorOnly = String(input.role || '').trim().toLowerCase() === 'curator';
  const curator = input.hasCuratorProfile === true || curatorOnly;
  const team = !curatorOnly;
  if (team && curator) return 'both';
  if (team) return 'team';
  if (curator) return 'curator';
  return null;
}

/** Where one rollout's songs live in storage, inside the private release-assets
 *  bucket. */
export const musicFolder = (releaseId: string): string => `music/${releaseId}/`;

/** The record route refuses any storage path that is not a file directly inside
 *  its own rollout's music folder, so a caller cannot point a song at someone
 *  else's file or walk out of the folder. */
export function isOwnMusicPath(releaseId: string, path: string): boolean {
  const folder = musicFolder(releaseId);
  if (!path.startsWith(folder) || path.includes('..')) return false;
  const name = path.slice(folder.length);
  return name.length > 0 && !name.includes('/');
}

/** The most songs a listener can keep saved, and the most one request can return by id. */
export const MUSIC_SAVED_LIMIT = 100;
