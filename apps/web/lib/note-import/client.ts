// Bring your notes: the browser's calls to the two AI routes. Kept out of the
// dialog so the dialog stays about screens.

import { PHOTO_MAX_BYTES } from './photo';
import { SORT_BATCH_SIZE, applySort, toSortRequestItems, type AppliedSort, type SortResult } from './ai-sort';
import type { ImportItem } from './build';

const MAX_SIDE = 1600;

/**
 * Shrinks a photo on the phone before it is sent: long side 1600px, JPEG. A
 * phone photo is 3 to 8 MB; this is a few hundred KB, which is what makes
 * reading photos work on mobile data. Returns null when the browser cannot
 * decode the file (HEIC on some Android browsers).
 */
export async function shrinkPhoto(file: File): Promise<File | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return null;
    // White behind transparent PNGs, so screenshots do not go black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= PHOTO_MAX_BYTES) return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    }
    return null;
  } catch {
    return null;
  }
}

export type PhotoReadResult = { ok: true; text: string } | { ok: false; error: string };

export async function readPhotoText(file: File, token: string): Promise<PhotoReadResult> {
  const shrunk = await shrinkPhoto(file);
  if (!shrunk) return { ok: false, error: "Couldn't open that photo. Try a JPG or PNG, or take a screenshot of it." };
  const form = new FormData();
  form.append('file', shrunk);
  try {
    const response = await fetch('/api/notes/import/photo', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const payload = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (!response.ok || typeof payload?.text !== 'string') {
      return { ok: false, error: payload?.error || 'Could not read that photo. Try another one.' };
    }
    return { ok: true, text: payload.text };
  } catch {
    return { ok: false, error: 'Could not reach Urganize. Check your connection and try again.' };
  }
}

export type AiSortOutcome =
  | { ok: true; applied: AppliedSort; summary: string }
  | { ok: false; error: string };

/** Sends the cards in batches and lays the answers over them. Stops at the first failure and says why. */
export async function sortWithAi(
  items: ImportItem[],
  token: string,
  onProgress?: (done: number, total: number) => void
): Promise<AiSortOutcome> {
  const results: SortResult[] = [];
  let summary = '';
  for (let start = 0; start < items.length; start += SORT_BATCH_SIZE) {
    const batch = items.slice(start, start + SORT_BATCH_SIZE);
    onProgress?.(start, items.length);
    try {
      const response = await fetch('/api/notes/import/sort', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: toSortRequestItems(batch) }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { results?: SortResult[]; summary?: string; error?: string }
        | null;
      if (!response.ok || !Array.isArray(payload?.results)) {
        return { ok: false, error: payload?.error || 'UrgAns could not sort that just now.' };
      }
      results.push(...payload.results);
      if (!summary && payload.summary) summary = payload.summary;
    } catch {
      return { ok: false, error: 'Could not reach Urganize. Check your connection and try again.' };
    }
  }
  onProgress?.(items.length, items.length);
  return { ok: true, applied: applySort(items, results), summary };
}
