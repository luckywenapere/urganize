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

/** What a DJ can actually load. Deliberately the same list the release-level
 *  song upload accepts, so "the master" means one thing in this product. */
export const SONG_VERSION_MIME_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
] as const;

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

  if (!(SONG_VERSION_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return {
      message: 'That is not an audio file a DJ can load. Use MP3, WAV or FLAC.',
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
  const name = fileName.toLowerCase();
  // Longest / most specific first: "radio edit" contains "radio", and an
  // "instrumental" file is not a "clean" one even when both words appear.
  const rules: [RegExp, SongVersionLabel][] = [
    [/\bradio\s*edit\b|\bradio\b/, 'radio_edit'],
    [/\binstrumental\b|\binstr\b/, 'instrumental'],
    [/\bac?ape?lla\b|\bacap\b/, 'acapella'],
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
