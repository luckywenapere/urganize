/**
 * Song version uploads: what the product will accept as a playable file.
 *
 * Pure, and shared by BOTH sides — the picker rejects a file before it starts,
 * and the route rejects it again — so a client cannot offer something the API
 * refuses (the asset-constants.ts pattern).
 */

import { ASSET_SIZE_LIMITS } from '@/lib/asset-constants';
import { SONG_VERSION_LABELS, type SongVersionLabel } from '@/lib/setlist';

/**
 * The per-file ceiling, inherited from the audio asset category.
 *
 * ⚠️ 40 MiB is NOT a product choice — it exists because Supabase's free plan
 * refuses uploads over 50 MB. That is tight for audio: a 4 minute WAV at
 * 44.1/16 is ~38 MiB, and a studio master at 24/48 runs ~16 MiB PER MINUTE and
 * will be rejected outright. So a DJ pack can offer MP3 today and cannot offer
 * WAV until that plan changes. Raising this without raising the Supabase plan
 * moves the failure from a clear message to a failed upload.
 */
export const MAX_SONG_VERSION_BYTES = ASSET_SIZE_LIMITS.audio;

/**
 * What a DJ can actually load: MP3, WAV, AIFF, FLAC and M4A.
 *
 * AIFF and M4A joined on 2026-09-25. AIFF is the format Rekordbox and Serato
 * users keep their libraries in, and an M4A is what a lot of music leaves a
 * Mac as, so refusing them turned away the files DJs actually have.
 *
 * Every spelling a browser uses for these, because they disagree: Chrome says
 * audio/mpeg for an MP3 where some Windows builds say audio/mp3, and WAV has
 * four names in the wild.
 */
export const SONG_VERSION_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/flac',
  'audio/x-flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
] as const;

/** The one type each accepted file is stored and served as. */
const CANONICAL_MIME: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'audio/x-flac': 'audio/flac',
  'audio/x-aiff': 'audio/aiff',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
};

/** File extension to type, for when the browser does not say. */
const EXTENSION_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  m4a: 'audio/mp4',
};

/** The extensions a file picker should offer, for its accept attribute. */
export const SONG_VERSION_ACCEPT = [
  ...Object.keys(EXTENSION_MIME).map((extension) => `.${extension}`),
  ...SONG_VERSION_MIME_TYPES,
].join(',');

const extensionOf = (fileName: string): string => {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  return match ? match[1].toLowerCase() : '';
};

/**
 * The type to store a file as, or null when it is not one we accept.
 *
 * The browser's own type wins when it names an audio format we take. When it
 * says NOTHING (an empty string, or application/octet-stream), the extension
 * decides — Windows reports FLAC and AIFF files that way, and before
 * 2026-09-25 a perfectly good FLAC was refused as "not an audio file". A type
 * that names something else entirely (video/mp4, image/png) is refused rather
 * than second-guessed from the name.
 */
export function resolveSongVersionMimeType(fileName: string, browserType: string): string | null {
  const type = (browserType || '').trim().toLowerCase();
  if ((SONG_VERSION_MIME_TYPES as readonly string[]).includes(type)) {
    return CANONICAL_MIME[type] ?? type;
  }
  if (type && type !== 'application/octet-stream') return null;
  return EXTENSION_MIME[extensionOf(fileName)] ?? null;
}

export type SongVersionUploadInput = {
  fileName: string;
  mimeType: string;
  fileSize: number;
};

export type SongVersionUploadError = { message: string; status: 400 | 413 };

const formatMib = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/**
 * Returns null when the file is acceptable, or the refusal to show.
 *
 * The size message names MP3 explicitly rather than saying "too big", because
 * the fix a manager can actually apply is exporting a smaller file — and given
 * the ceiling above, that is very often the real answer.
 */
export function validateSongVersionUpload(
  input: SongVersionUploadInput
): SongVersionUploadError | null {
  if (!input.fileName || !input.fileName.trim()) {
    return { message: 'That file has no name.', status: 400 };
  }

  if (!resolveSongVersionMimeType(input.fileName, input.mimeType)) {
    return {
      message: 'That is not an audio file a DJ can load. Use MP3, WAV, AIFF, FLAC or M4A.',
      status: 400,
    };
  }

  if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
    return { message: 'That file looks empty.', status: 400 };
  }

  if (input.fileSize > MAX_SONG_VERSION_BYTES) {
    return {
      message: `That file is over ${formatMib(MAX_SONG_VERSION_BYTES)}. Send an MP3 rather than a WAV master.`,
      status: 413,
    };
  }

  return null;
}

/** Guesses a version label from the file name, so the common case needs no
 *  picking. Falls back to 'original' — never to a wrong guess, because the
 *  label is what a DJ reads to know which file to play. */
export function guessVersionLabel(fileName: string): SongVersionLabel {
  // File names join words with underscores, dots and dashes, and to a regex an
  // underscore is part of a word, so "Song_Instrumental" never matched
  // "instrumental" and the instrumental went out as the Original, which is the
  // file a DJ is sent by default. Turn the joins into spaces first.
  const name = fileName
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,5}$/, '')
    .replace(/[_.\-()[\]{}]+/g, ' ');
  // Longest / most specific first: "radio edit" contains "radio", and an
  // "instrumental" file is not a "clean" one even when both words appear.
  const rules: [RegExp, SongVersionLabel][] = [
    [/\bradio\s*edit\b|\bradio\b/, 'radio_edit'],
    [/\binstrumental\b|\binstr\b/, 'instrumental'],
    // acapella, acappella, a cappella, a capella.
    [/\ba\s?capp?ell?a\b|\bacap\b/, 'acapella'],
    [/\bextended\b|\blong\s*mix\b/, 'extended'],
    [/\blive\b/, 'live'],
    [/\bdirty\b|\bexplicit\b/, 'dirty'],
    [/\bclean\b/, 'clean'],
  ];

  for (const [pattern, label] of rules) {
    if (pattern.test(name)) return label;
  }
  return 'original';
}

export const isKnownVersionLabel = (value: unknown): value is SongVersionLabel =>
  typeof value === 'string' && (SONG_VERSION_LABELS as readonly string[]).includes(value);
