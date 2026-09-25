// Voice input for UrgAns (NEXT_PUBLIC_FEATURE_URGANS_VOICE).
//
// The person records a short clip in the browser; we forward it to a speech
// model through /api/urgans/transcribe and drop the transcript into the message
// box for them to read, fix and send. Nothing is sent automatically, and the
// audio is never stored — it is streamed through the route and discarded.
//
// This module is CLIENT-SAFE (no next/server, no node imports) so the recorder
// hook and the route can share one set of rules — the same split
// lib/genre-prediction.ts uses for its own upload validation.

const MIB = 1024 * 1024;

// A minute is plenty for a spoken instruction to UrgAns, and it keeps the clip
// well under the byte ceiling below. The recorder stops itself at this length.
export const MAX_VOICE_CLIP_SECONDS = 60;

// Under Vercel's ~4.5 MB request-body cap, the same reasoning as
// MAX_GENRE_PREDICTION_FILE_BYTES. Opus at ~24 kbps is ~180 KB/minute, so a
// full 60s clip is nowhere near this — the limit is a guard against a stuck
// recorder or a non-browser caller, not the normal case.
export const MAX_VOICE_CLIP_BYTES = 4 * MIB;

// Per-team transcriptions in a rolling 24h. Speaking is NOT metered against the
// monthly UrgAns action ceiling (founder call) — only the send that follows is,
// exactly as typing is. This cap exists purely to stop a runaway loop or abuse,
// and it fails OPEN on an unreadable count, like every other counter here.
export const VOICE_DAILY_CAP = 100;

// Recording container/codec candidates, best first. Chrome/Firefox/Android take
// webm+opus; Safari and iOS only offer mp4 (AAC). ogg is a last resort. We hand
// whichever the browser reports as supported to MediaRecorder AND to the model,
// so the extension we forward always matches the bytes.
export const VOICE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

// What the server accepts, matched on the base type (";codecs=…" stripped).
// A superset of what we record, so a clip from any supported browser is valid,
// plus the plain forms a non-browser caller might send.
const VOICE_ACCEPTED_MIMES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/x-m4a',
]);

// The upstream transcription "prompt" is a vocabulary hint, not an instruction —
// it nudges the model to spell names it would otherwise mangle. Kept short:
// a long prompt costs tokens and can bias the transcript toward its own words.
const MAX_PROMPT_CHARS = 200;

const stripCodecs = (mimeType: string): string => mimeType.split(';')[0]!.trim().toLowerCase();

/**
 * The first candidate the browser can actually record. `isTypeSupported` is
 * `MediaRecorder.isTypeSupported` (passed in so this stays testable and
 * client-safe). Null means the browser cannot record any format we accept, in
 * which case the mic button is not shown at all — a control that cannot work is
 * worse than none.
 */
export function pickRecordingMimeType(
  isTypeSupported: (mimeType: string) => boolean
): string | null {
  for (const candidate of VOICE_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(candidate)) return candidate;
    } catch {
      // Some engines throw on an unknown type instead of returning false.
    }
  }
  return null;
}

export type VoiceClipValidation = { ok: true } | { ok: false; error: string; tooLarge: boolean };

/**
 * Validate a recorded clip before it goes to the server, and again on the
 * server against the same rules (the genre-prediction pattern — one source of
 * truth so the client and the route cannot disagree about what is acceptable).
 */
export function validateVoiceClip(input: {
  mimeType: string;
  size: number;
}): VoiceClipValidation {
  if (input.size <= 0) {
    return { ok: false, error: 'That recording was empty. Try again.', tooLarge: false };
  }
  if (input.size > MAX_VOICE_CLIP_BYTES) {
    return {
      ok: false,
      error: 'That recording is too long. Keep it under a minute.',
      tooLarge: true,
    };
  }
  const base = stripCodecs(input.mimeType || '');
  if (!VOICE_ACCEPTED_MIMES.has(base)) {
    return { ok: false, error: 'That audio format is not supported.', tooLarge: false };
  }
  return { ok: true };
}

/**
 * Read the transcript out of the model's response. The OpenAI-style shape is
 * `{ text }`; we tolerate a bare string too. An empty or whitespace-only result
 * becomes null so the caller can tell "nothing was said" apart from a real
 * transcript.
 */
export function parseTranscription(body: unknown): string | null {
  const raw =
    typeof body === 'string'
      ? body
      : typeof (body as { text?: unknown })?.text === 'string'
        ? (body as { text: string }).text
        : '';
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A vocabulary hint built from the scoped rollout, so the model spells the
 * artist and title right instead of guessing. Control characters are stripped
 * (the hint rides in a form field) and the whole thing is capped.
 */
export function buildTranscriptionPrompt(hints: {
  releaseTitle?: string | null;
  artistName?: string | null;
}): string {
  const parts = [hints.artistName, hints.releaseTitle]
    .map((part) => (part ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0) return '';
  const prompt = `Names that may come up: ${parts.join(', ')}.`;
  return prompt.length > MAX_PROMPT_CHARS ? prompt.slice(0, MAX_PROMPT_CHARS).trim() : prompt;
}

/**
 * Add the transcript to whatever is already typed, with a single space between,
 * and NEVER replace it. Someone who typed half a message and then spoke the
 * rest should get both. Leading/trailing spaces around the join are collapsed.
 */
export function mergeTranscript(current: string, spoken: string): string {
  const existing = current.trimEnd();
  const addition = spoken.trim();
  if (!addition) return current;
  if (!existing) return addition;
  return `${existing} ${addition}`;
}
