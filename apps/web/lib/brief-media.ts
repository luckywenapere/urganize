// Photos, captions, sticky notes and cover colours on the brief board (#897
// phase 2, 2026-10-30). Pure, so the limits and the colour picking are tested
// without a browser or a database.

import type { Parsed } from '@/lib/release-brief';

/** A caption under a picture on the board. */
export const BRIEF_CAPTION_MAX = 60;
/** A sticky note. */
export const BRIEF_NOTE_MAX = 280;
/** The biggest photo the board takes, after the browser shrinks it. */
export const BRIEF_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Longest edge kept: sharp on a big screen, small enough to load on a phone. */
export const BRIEF_IMAGE_EDGE_PX = 2000;
export const BRIEF_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function parseCaption(body: unknown): Parsed<string> {
  const raw = (body as { caption?: unknown } | null)?.caption;
  if (typeof raw !== 'string') return { ok: false, error: 'Send a caption.' };
  const caption = raw.trim();
  if (caption.length > BRIEF_CAPTION_MAX) {
    return { ok: false, error: `Keep the caption to ${BRIEF_CAPTION_MAX} characters.` };
  }
  return { ok: true, value: caption };
}

export function parseNoteText(body: unknown): Parsed<string> {
  const raw = (body as { text?: unknown } | null)?.text;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return { ok: false, error: 'Write something on the note.' };
  if (text.length > BRIEF_NOTE_MAX) return { ok: false, error: `Keep the note to ${BRIEF_NOTE_MAX} characters.` };
  return { ok: true, value: text };
}

export function validateBriefImage(file: { mimeType: string; size: number }): { ok: true } | { ok: false; error: string } {
  if (!(BRIEF_IMAGE_TYPES as readonly string[]).includes(file.mimeType)) {
    return { ok: false, error: 'Add a JPEG, PNG or WebP photo.' };
  }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > BRIEF_IMAGE_MAX_BYTES) return { ok: false, error: 'That photo is over 10 MB.' };
  return { ok: true };
}

/** Where an uploaded photo lives in the private release-assets bucket. */
export function briefImagePath(releaseId: string, id: string, mimeType: string): string {
  return `brief/${releaseId}/${id}.${EXTENSION[mimeType] ?? 'jpg'}`;
}

/** A path the browser sends back must be one this rollout's upload made: its folder, one file, no climbing. */
export function isBriefImagePath(releaseId: string, path: unknown): path is string {
  if (typeof path !== 'string') return false;
  const prefix = `brief/${releaseId}/`;
  if (!path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return /^[0-9a-zA-Z-]{1,64}\.(jpg|png|webp)$/.test(name);
}

/** Who may change or remove a picture, link or note: whoever added it, or the rollout's owner or a team admin. */
export function mayChangeBriefItem(input: { createdBy: string | null; userId: string; isLead: boolean }): boolean {
  if (input.isLead) return true;
  return Boolean(input.createdBy) && input.createdBy === input.userId;
}

// ── Colours from the cover ───────────────────────────────────────────────────

const hex = (value: number) => value.toString(16).padStart(2, '0').toUpperCase();

/** Squared distance between two colours, so "too close" needs no square root. */
function distance(a: number[], b: number[]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

// Two colours closer than this read as the same swatch (about 40 apart).
const TOO_CLOSE = 40 * 40;

/**
 * The colours a cover is made of, most used first: pixels are grouped into
 * buckets (16 levels a channel), each bucket's average is its colour, and a
 * colour too close to one already picked is skipped. Takes RGBA pixels from a
 * downscaled canvas; see-through pixels are ignored.
 */
export function pickPalette(rgba: Uint8ClampedArray, count: number): string[] {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .map((bucket) => [bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n].map(Math.round));
  const picked: number[][] = [];
  for (const colour of ranked) {
    if (picked.length >= count) break;
    if (picked.some((other) => distance(other, colour) < TOO_CLOSE)) continue;
    picked.push(colour);
  }
  return picked.map(([r, g, b]) => `#${hex(r)}${hex(g)}${hex(b)}`);
}
