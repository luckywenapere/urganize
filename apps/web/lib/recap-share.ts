/**
 * Handing a release recap over to the person who asked for it.
 *
 * Client-safe and dependency-free, because two surfaces need the same answer:
 * the recap card in the UrgAns transcript, and anything else that later wants
 * to save a poster. It was local to `components/releases/RecapModal.tsx` until
 * 2026-09-07, when that modal was deleted on a founder call and the recap moved
 * into the conversation — at which point the second consumer made a shared
 * home worth having.
 */

/** The two sizes the route renders: a 1080x1920 story and a 1080x1080 square. */
export type RecapSize = 'story' | 'square';

/** How long a slugged title may be before it stops looking like a filename. */
const MAX_SLUG_CHARS = 40;

/**
 * The filename a saved or shared recap lands under.
 *
 * The fallback is the point: a title that slugs away to nothing (punctuation,
 * emoji, or an empty string) would otherwise produce `-recap-story.png`, which
 * reads as a broken file rather than a poster. The size is in the name because
 * somebody who saves both gets two files in one folder.
 */
export function recapFileName(releaseTitle: string, size: RecapSize): string {
  const slug =
    releaseTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_SLUG_CHARS)
      // A cap can land mid-word and leave a trailing hyphen behind, so trim
      // again after slicing rather than before.
      .replace(/-+$/g, '') || 'release';
  return `${slug}-recap-${size}.png`;
}
