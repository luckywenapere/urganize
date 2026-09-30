/**
 * Client-safe constants and pure logic for the genre prediction feature —
 * size limit, audio-type allowlist, upload validation, and the response
 * parser for the external genre model.
 *
 * Imported by both MetadataSection (client pre-check) and the predict-genre
 * route (server guard) so the two can't drift (the asset-constants.ts
 * pattern). No node-only imports.
 */

const MIB = 1024 * 1024;

// Vercel serverless caps request bodies at ~4.5 MB (the platform 413s before
// our handler runs) and the Lambda function URL caps payloads at ~6 MB.
// 4 MiB leaves headroom for multipart framing under the tighter Vercel limit.
export const MAX_GENRE_PREDICTION_FILE_BYTES = 4 * MIB;

export const GENRE_PREDICTION_AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/flac',
  'audio/x-flac',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
];

export const GENRE_PREDICTION_AUDIO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.flac',
  '.m4a',
  '.aac',
  '.ogg',
];

// input[accept] value for the hidden file picker.
export const GENRE_PREDICTION_ACCEPT_ATTR = ['audio/*', ...GENRE_PREDICTION_AUDIO_EXTENSIONS].join(
  ','
);

export type GenrePredictionUploadAttributes = {
  fileName: string;
  mimeType: string;
  fileSize: number;
};

// MIME first, extension fallback: browsers report '' or generic types for
// .flac/.m4a on some platforms (File.type is advisory), so the extension is
// the tiebreaker on both sides.
export function validateGenrePredictionUpload(
  attrs: GenrePredictionUploadAttributes
): { ok: true } | { ok: false; error: string } {
  if (attrs.fileSize > MAX_GENRE_PREDICTION_FILE_BYTES) {
    const fileSizeMib = (attrs.fileSize / MIB).toFixed(1);
    return {
      ok: false,
      error: `File is ${fileSizeMib} MiB. The limit is 4 MiB. Try an MP3 instead of a WAV master.`,
    };
  }

  const mime = (attrs.mimeType || '').toLowerCase().split(';')[0].trim();
  if (GENRE_PREDICTION_AUDIO_MIMES.includes(mime)) return { ok: true };

  const name = (attrs.fileName || '').toLowerCase();
  if (GENRE_PREDICTION_AUDIO_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return { ok: true };
  }

  return { ok: false, error: 'Pick an audio file (MP3, WAV, FLAC, M4A, AAC, or OGG).' };
}

export type GenrePrediction = {
  genre: string;
  confidence: number | null;
};

// GTZAN-style classifiers emit lowercase snake_case labels ("hip_hop"). Make
// it presentable but keep it a plain editable string — the genre field is
// free text and the user reviews before saving.
export function normalizeGenreLabel(label: string): string {
  const cleaned = label
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
  if (!cleaned) return cleaned;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

const GENRE_FIELD_KEYS = ['genre', 'predicted_genre', 'prediction', 'label', 'class', 'class_name'];
const CONFIDENCE_FIELD_KEYS = ['confidence', 'probability', 'score'];
const NESTED_OBJECT_KEYS = ['prediction', 'result', 'data'];
const NESTED_LIST_KEYS = ['predictions', 'results'];

// TODO(genre-prediction): pin this to the confirmed schema once the model
// developer fixes the Lambda and documents the /predict response. The
// endpoint's OpenAPI doc leaves the shape unspecified, so until then accept
// every plausible field name a FastAPI classifier template emits.
export function parseGenrePrediction(raw: unknown): GenrePrediction | null {
  // Bare string body: "hiphop".
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? { genre: normalizeGenreLabel(trimmed), confidence: null } : null;
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  // Flat shapes first: { genre }, { predicted_genre, confidence }, ...
  const genreRaw = GENRE_FIELD_KEYS.map((key) => record[key]).find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  if (genreRaw) {
    const confidenceRaw = CONFIDENCE_FIELD_KEYS.map((key) => record[key]).find(
      (value): value is number => typeof value === 'number' && Number.isFinite(value)
    );
    return { genre: normalizeGenreLabel(genreRaw), confidence: normalizeConfidence(confidenceRaw) };
  }

  // Nested shapes: { prediction: {...} }, { result: {...} }, { data: {...} }.
  for (const key of NESTED_OBJECT_KEYS) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const parsed = parseGenrePrediction(nested);
      if (parsed) return parsed;
    }
  }

  // Ranked lists: { predictions: [{...}, ...] } — take the first entry.
  for (const key of NESTED_LIST_KEYS) {
    const list = record[key];
    if (Array.isArray(list) && list.length > 0) {
      const parsed = parseGenrePrediction(list[0]);
      if (parsed) return parsed;
    }
  }

  return null;
}

// Accept 0–1 or 0–100; normalize to 0–1. Anything out of range is treated as
// unknown rather than shown as a nonsense percentage.
function normalizeConfidence(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (value >= 0 && value <= 1) return value;
  if (value > 1 && value <= 100) return value / 100;
  return null;
}
