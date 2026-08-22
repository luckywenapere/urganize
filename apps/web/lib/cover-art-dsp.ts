/**
 * Cover art against DSP (Spotify, Apple Music, and every distributor that
 * feeds them) artwork requirements.
 *
 * Pure — no React, no I/O, no env — so the picker, the prompt sheet and the
 * scene can all grade the same file the same way, and so the rules are unit
 * testable. Reading the pixels is a browser job and lives next door in
 * `lib/cover-art-image.ts`; this module only judges the numbers.
 *
 * Three verdicts, and the split between them is a founder call rather than a
 * transcription of any one DSP's spec sheet:
 *
 *   blocked  the file cannot become artwork at all (unreadable, not square,
 *            or so small no DSP would take it). Refused at the picker.
 *   warning  usable in the product, not yet ready for the distributor. This
 *            is the case that matters: a manager frequently has only the
 *            designer's draft, and needs it on the release card TODAY while
 *            the final 3000px file is still being cut. Blocking that would
 *            make the product worse than the group chat it replaces.
 *   ready    square, at least 3000x3000, JPEG or PNG.
 *
 * Colour space (DSPs want RGB, not CMYK) is deliberately NOT graded: it needs
 * ICC profile parsing, and getting it wrong in either direction is worse than
 * the advisory line the copy already carries.
 */

/** Apple Music's floor, and the number every distributor quotes. */
export const DSP_MIN_EDGE = 3000;

/**
 * Below this, nothing will take the file — Spotify's own smallest accepted
 * artwork size. A square image under it is not a draft, it is a thumbnail.
 */
export const DSP_ABSOLUTE_MIN_EDGE = 640;

/** The formats DSPs actually ingest. WebP is not one of them. */
export const DSP_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

export type CoverArtVerdict = 'ready' | 'warning' | 'blocked';

export type CoverArtGrade = {
  verdict: CoverArtVerdict;
  /** One short line, safe to render on its own. */
  headline: string;
  /** What to do about it. Empty when there is nothing to do. */
  detail: string;
};

/** "3000 x 3000", with the multiplication sign rather than a letter x. */
export function formatDimensions(width: number, height: number): string {
  return `${Math.round(width)} × ${Math.round(height)}`;
}

function isUsableEdge(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Grade an image we have already measured. `null` dimensions mean the browser
 * could not decode it, which is itself a block: an image we cannot read is an
 * image we cannot promise anything about.
 */
export function gradeCoverArt(input: {
  width: number | null | undefined;
  height: number | null | undefined;
  mimeType?: string | null;
}): CoverArtGrade {
  const width = Number(input.width);
  const height = Number(input.height);

  if (!isUsableEdge(width) || !isUsableEdge(height)) {
    return {
      verdict: 'blocked',
      headline: 'We could not read that image.',
      detail: 'Export it again as a JPEG or PNG and try once more.',
    };
  }

  if (Math.round(width) !== Math.round(height)) {
    return {
      verdict: 'blocked',
      headline: `That image is ${formatDimensions(width, height)}, not square.`,
      detail: 'Cover art has to be a perfect square. Every DSP rejects anything else.',
    };
  }

  const edge = Math.round(width);

  if (edge < DSP_ABSOLUTE_MIN_EDGE) {
    return {
      verdict: 'blocked',
      headline: `That image is only ${formatDimensions(width, height)}.`,
      detail: `Cover art has to be at least ${DSP_ABSOLUTE_MIN_EDGE} pixels on each side.`,
    };
  }

  const isDspFormat = DSP_MIME_TYPES.includes((input.mimeType || '').toLowerCase());

  if (edge < DSP_MIN_EDGE) {
    return {
      verdict: 'warning',
      headline: `${formatDimensions(width, height)}. Good for now, too small for the distributor.`,
      detail: `Use it while the artwork is still in progress. Get a ${DSP_MIN_EDGE} × ${DSP_MIN_EDGE} version before you upload to the distributor.`,
    };
  }

  if (!isDspFormat) {
    return {
      verdict: 'warning',
      headline: `${formatDimensions(width, height)}, but the wrong format.`,
      detail: 'DSPs take JPEG or PNG. Save it as one of those before the distributor handoff.',
    };
  }

  return {
    verdict: 'ready',
    headline: `${formatDimensions(width, height)}. Ready for the distributor.`,
    detail: '',
  };
}

/** The requirement, as one line of helper copy. */
export const DSP_REQUIREMENT_LABEL = `Square JPEG or PNG, ${DSP_MIN_EDGE} × ${DSP_MIN_EDGE} or larger`;
