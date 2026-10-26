// SERVER ONLY. The one call to the speech model, shared by UrgAns's transcribe
// route (app/api/urgans/transcribe) and the rollout ideas mic
// (app/api/releases/[releaseId]/ideas/transcribe). Each route keeps its own
// gate, its own daily-cap check and its own billing-event write, so the guards
// on each route still read them in place; only the upstream request lives here.
//
// The clip is streamed through and NEVER stored: no storage write, no insert.

import { parseTranscription } from '@/lib/urgans-voice';

/** One attempt, no retry: re-uploading the clip doubles the worst case. */
export const TRANSCRIBE_TIMEOUT_MS = 30_000;

export type TranscriptionConfig = { apiKey: string; model: string; baseURL: string };

export type TranscriptionResult =
  | { ok: true; text: string; rawBody: unknown }
  | { ok: false; status: number; error: string };

/**
 * Forward a clip to `${baseURL}/audio/transcriptions` (the OpenAI multipart
 * shape) and read the text back. Never throws.
 */
export async function requestTranscription(input: {
  config: TranscriptionConfig;
  file: File;
  hint?: string | null;
  timeoutMs?: number;
}): Promise<TranscriptionResult> {
  const { config, file } = input;
  // Never set Content-Type by hand: fetch derives the boundary from the body.
  const upstreamForm = new FormData();
  upstreamForm.append('file', file, file.name || 'audio');
  upstreamForm.append('model', config.model);
  upstreamForm.append('language', 'en');
  upstreamForm.append('response_format', 'json');
  const hint = typeof input.hint === 'string' ? input.hint.trim() : '';
  if (hint) upstreamForm.append('prompt', hint);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(`${config.baseURL}/audio/transcriptions`, {
      method: 'POST',
      body: upstreamForm,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  } catch (error) {
    const isAbort = (error as { name?: string } | null)?.name === 'AbortError';
    if (isAbort) return { ok: false, status: 504, error: 'That took too long. Try a shorter clip.' };
    return { ok: false, status: 503, error: 'Voice is unreachable right now. Try again in a moment.' };
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    if (upstream.status === 429) {
      return { ok: false, status: 503, error: 'Voice is busy right now. Try again in a moment.' };
    }
    console.error(`[voice-transcribe] Upstream returned ${upstream.status}.`);
    return { ok: false, status: 502, error: 'Voice hit an error. Try again later, or type instead.' };
  }

  const rawText = await upstream.text().catch(() => '');
  let rawBody: unknown = rawText;
  try {
    rawBody = JSON.parse(rawText);
  } catch {
    // A bare string is fine: parseTranscription reads it.
  }

  const text = parseTranscription(rawBody);
  if (!text) return { ok: false, status: 422, error: "Didn't catch that. Try again." };
  return { ok: true, text, rawBody };
}
