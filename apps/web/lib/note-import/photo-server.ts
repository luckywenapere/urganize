// SERVER ONLY. The one call that reads a photo, through the same RodiumAi key
// and base UrgAns already uses (one vendor). One attempt, no retry: sending the
// picture twice doubles the worst case. The image is never stored.

import { getTranscriptionConfig } from '@/lib/chappi/config';
import { PHOTO_SYSTEM_PROMPT, cleanPhotoText } from './photo';

export const PHOTO_TIMEOUT_MS = 40_000;
const DEFAULT_PHOTO_MODEL = 'openai/gpt-4o-mini';

export type PhotoResult = { ok: true; text: string; model: string } | { ok: false; status: number; error: string };

export function getPhotoConfig(): { apiKey: string; baseURL: string; model: string } | null {
  // Same key and base as dictation; only the model differs.
  const base = getTranscriptionConfig();
  if (!base) return null;
  const model = String(process.env.NOTES_PHOTO_MODEL || '').trim() || DEFAULT_PHOTO_MODEL;
  return { apiKey: base.apiKey, baseURL: base.baseURL, model };
}

export async function requestPhotoText(input: {
  config: { apiKey: string; baseURL: string; model: string };
  bytes: ArrayBuffer;
  mimeType: string;
}): Promise<PhotoResult> {
  const { config } = input;
  const dataUrl = `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString('base64')}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PHOTO_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(`${config.baseURL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 3000,
        messages: [
          { role: 'system', content: PHOTO_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Write out the text in this image.' },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    const isAbort = (error as { name?: string } | null)?.name === 'AbortError';
    if (isAbort) return { ok: false, status: 504, error: 'That took too long. Try a smaller photo.' };
    return { ok: false, status: 503, error: 'Reading photos is unreachable right now. Try again in a moment.' };
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    if (upstream.status === 429) return { ok: false, status: 503, error: 'Reading photos is busy right now. Try again in a moment.' };
    return { ok: false, status: 502, error: 'Could not read that photo. Try another one.' };
  }

  const body = (await upstream.json().catch(() => null)) as {
    choices?: { message?: { content?: unknown } }[];
  } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') return { ok: false, status: 502, error: 'Could not read that photo. Try another one.' };
  return { ok: true, text: cleanPhotoText(content), model: config.model };
}
