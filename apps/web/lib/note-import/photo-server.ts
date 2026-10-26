// SERVER ONLY. Reads one photo through the shared AI gateway (lib/ai/provider's
// readImageText: same key, base and error mapping as every other AI feature).
// One attempt, no retry. The image is never stored.

import { isAiConfigured, readImageText } from '@/lib/ai/provider';
import { PHOTO_SYSTEM_PROMPT, cleanPhotoText } from './photo';

export type PhotoResult = { ok: true; text: string; model: string } | { ok: false; status: number; error: string };

export const isPhotoReadingConfigured = (): boolean => isAiConfigured();

export async function requestPhotoText(input: { bytes: ArrayBuffer; mimeType: string }): Promise<PhotoResult> {
  const imageDataUrl = `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString('base64')}`;
  try {
    const result = await readImageText({
      system: PHOTO_SYSTEM_PROMPT,
      prompt: 'Write out the text in this image.',
      imageDataUrl,
      // Optional pin for a vision model; unset uses the gateway's default.
      model: String(process.env.NOTES_PHOTO_MODEL || '').trim() || undefined,
    });
    return { ok: true, text: cleanPhotoText(result.text), model: result.model };
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    const status = (error as { status?: number } | null)?.status;
    if (name === 'AbortError') return { ok: false, status: 504, error: 'That took too long. Try a smaller photo.' };
    if (status === 429) return { ok: false, status: 503, error: 'Reading photos is busy right now. Try again in a moment.' };
    return { ok: false, status: 502, error: 'Could not read that photo. Try another one.' };
  }
}
