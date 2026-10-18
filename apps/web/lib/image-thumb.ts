/**
 * Small display copies of cover art and profile photos ("thumbs").
 *
 * WHY (founder ask, 2026-10-18). A rollout row painted its 40px cover from the
 * full upload: a real one was a 2.9 MB 1254x1254 PNG, so on a phone the tile
 * streamed in top to bottom and sat half painted. Every list, picker and
 * roster tile only ever shows these images small, so they now read a 384px
 * square copy stored next to the original (roughly 15-30 KB instead of
 * megabytes). The original is never touched: a distributor still needs the
 * exact master (lib/cover-art-dsp.ts), and the full views keep using it.
 *
 * STORAGE. The thumb lives in the same private bucket at `<original>.thumb`,
 * so it needs no database column and no migration: readers try to sign the
 * thumb path and fall back to the original when it is not there (every upload
 * from before this change, or a browser that could not encode one). Deleting
 * an original deletes `<original>.thumb` with it (withThumbPaths).
 *
 * WHY NOT AN IMAGE SERVICE. Supabase image transforms are off on this plan,
 * and the Vercel image optimizer has a small Hobby quota that signed URLs
 * (a new token every hour) would burn through, so the browser makes the copy
 * at upload time instead (lib/image-thumb-client.ts).
 *
 * Pure: constants and path rules only, so client and server share them.
 */

/** Edge of the square thumb. Sharp for a 128px slot on a 3x screen, which
 *  is the largest place a thumb is shown (the artist header photo). */
export const THUMB_EDGE_PX = 384;

export const THUMB_SUFFIX = '.thumb';

/** File names that are images, so a removal knows which paths may have a
 *  thumb beside them. Readers do not need it: cover art and photos are always
 *  images, and a missing thumb simply falls back to the original. */
const IMAGE_EXTENSION = /\.(jpe?g|png|webp|gif|heic|avif)$/i;

export function isThumbablePath(path: unknown): path is string {
  return typeof path === 'string' && path.length > 0 && !path.endsWith(THUMB_SUFFIX) && IMAGE_EXTENSION.test(path);
}

/** Where the thumb of `path` lives (same bucket). */
export function thumbPathFor(path: string): string {
  return `${path}${THUMB_SUFFIX}`;
}

/** `paths` plus the thumb of each image among them, for storage removals, so
 *  deleting a cover or a photo never leaves its small copy behind. Removing a
 *  thumb that was never made is a no-op in Supabase Storage. */
export function withThumbPaths(paths: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const path of paths) {
    if (!path) continue;
    out.add(path);
    if (isThumbablePath(path)) out.add(thumbPathFor(path));
  }
  return Array.from(out);
}
