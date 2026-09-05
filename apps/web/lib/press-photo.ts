/**
 * Press photos — the pure half: what a file has to be, and how good it is.
 *
 * DELIBERATELY NOT `lib/cover-art-dsp.ts`, and reaching for that module here
 * would be the bug rather than the shortcut. Its second tier BLOCKS anything
 * that is not square, because a DSP requires a square 3000x3000 image. Most
 * press shots are landscape, so grading aspect ratio would refuse the entire
 * input this feature exists to collect.
 *
 * What matters for a press photo is one number: the long edge. A magazine
 * running a photo at page width wants about 2000px; below roughly 1000px there
 * is nothing to run at all. Nothing else is graded.
 *
 * Client-safe: no imports beyond the shared constants, so a picker and a route
 * can both hold it. `readImageDimensions` in lib/cover-art-image.ts is the
 * measuring half and IS reused as-is, being generic over Blob.
 */

import {
  ASSET_MIME_ALLOWLIST,
  MAX_PRESS_PHOTO_BYTES,
  formatFileSize,
} from './asset-constants';

/** Anything smaller on its long edge cannot be run at any size. */
export const PRESS_PHOTO_MIN_EDGE = 1000;

/** What a magazine wants on the long edge for print. */
export const PRESS_PHOTO_PRINT_EDGE = 2000;

/** Same three formats every other image in the product takes. */
export const PRESS_PHOTO_MIME_TYPES: readonly string[] = ASSET_MIME_ALLOWLIST.promo_image;

export const PRESS_PHOTO_FILE_ACCEPT = PRESS_PHOTO_MIME_TYPES.join(',');

export const PRESS_PHOTO_FORMATS_LABEL = 'JPEG or PNG';

export type PressPhotoValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Size and format only. Dimensions are graded separately, because a photo that
 * is too small still uploads: the manager may have nothing better today, and
 * an empty Assets section is worse than a thin one.
 */
export function validatePressPhotoFile(file: {
  name: string;
  type: string;
  size: number;
}): PressPhotoValidationResult {
  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: 'That file is empty.' };
  }

  if (file.size > MAX_PRESS_PHOTO_BYTES) {
    return {
      ok: false,
      error: `That photo is ${formatFileSize(file.size)}. Press photos have to be under ${formatFileSize(
        MAX_PRESS_PHOTO_BYTES
      )}.`,
    };
  }

  if (!PRESS_PHOTO_MIME_TYPES.includes(file.type || '')) {
    return {
      ok: false,
      error: `That is not an image we can take. Use ${PRESS_PHOTO_FORMATS_LABEL}.`,
    };
  }

  return { ok: true };
}

export type PressPhotoVerdict = 'ready' | 'warning' | 'blocked';

export type PressPhotoGrade = {
  verdict: PressPhotoVerdict;
  /** One short line, safe to render on its own. */
  headline: string;
  /** What to do about it. Empty when there is nothing to do. */
  detail: string;
};

/**
 * Grade a photo on its long edge, and on nothing else.
 *
 * A warning never stops an upload. Only two things block: dimensions we could
 * not read at all, and a photo too small for any publication to use.
 */
export function gradePressPhoto(
  dimensions: { width: number; height: number } | null
): PressPhotoGrade {
  if (
    !dimensions ||
    !Number.isFinite(dimensions.width) ||
    !Number.isFinite(dimensions.height) ||
    dimensions.width <= 0 ||
    dimensions.height <= 0
  ) {
    return {
      verdict: 'blocked',
      headline: 'We could not read that image.',
      detail: 'Try saving it again as a JPEG or PNG.',
    };
  }

  const longEdge = Math.max(dimensions.width, dimensions.height);

  if (longEdge < PRESS_PHOTO_MIN_EDGE) {
    return {
      verdict: 'blocked',
      headline: `That photo is ${longEdge}px on its longest side.`,
      detail: `Press need at least ${PRESS_PHOTO_MIN_EDGE}px to run anything. Ask the photographer for the full size file.`,
    };
  }

  if (longEdge < PRESS_PHOTO_PRINT_EDGE) {
    return {
      verdict: 'warning',
      headline: 'Good for web, thin for print.',
      detail: `This is ${longEdge}px on its longest side. Print wants ${PRESS_PHOTO_PRINT_EDGE}px or more, so a magazine may ask for a bigger copy.`,
    };
  }

  return {
    verdict: 'ready',
    headline: 'Big enough for print.',
    detail: '',
  };
}

/**
 * What press may do with a photo.
 *
 * A picker rather than free text, per principle 3: a journalist reads the
 * answer at a glance instead of parsing a sentence, and every kit words it the
 * same way. The optional note beside it covers anything these four miss.
 */
export const PRESS_PHOTO_USAGE_RIGHTS = [
  {
    value: 'free_with_credit',
    label: 'Free to use with credit',
  },
  {
    value: 'press_only',
    label: 'Press and editorial only',
  },
  {
    value: 'ask_first',
    label: 'Ask before publishing',
  },
  {
    value: 'all_rights_reserved',
    label: 'All rights reserved',
  },
] as const;

export type PressPhotoUsageRight = (typeof PRESS_PHOTO_USAGE_RIGHTS)[number]['value'];

export function isPressPhotoUsageRight(value: unknown): value is PressPhotoUsageRight {
  return (
    typeof value === 'string' &&
    PRESS_PHOTO_USAGE_RIGHTS.some((option) => option.value === value)
  );
}

/**
 * The line to show for a stored rights value.
 *
 * An unrecognised value is handed straight back rather than blanked. The column
 * is free text in the database, so a row could hold a sentence somebody typed,
 * and showing it beats reporting the photo as having no rights set at all.
 */
export function usageRightLabel(value: string | null | undefined): string {
  if (!value) return '';
  const match = PRESS_PHOTO_USAGE_RIGHTS.find((option) => option.value === value);
  return match ? match.label : value;
}
