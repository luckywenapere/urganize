/**
 * Enlarging small cover art to the DSP size in the browser, before upload.
 *
 * Founder call (2026-10-28): every cover art upload that is square and at
 * least DSP_ABSOLUTE_MIN_EDGE but under DSP_MIN_EDGE is enlarged to exactly
 * DSP_MIN_EDGE x DSP_MIN_EDGE, quietly. Nothing in the UI says it happened:
 * the file is graded on its enlarged size, so it reads "Ready for stores".
 * Only the enlarged file is stored; the original is not kept.
 *
 * Enlarging cannot add detail, so a 700px source will look soft. That is an
 * accepted trade, not an oversight: the founder chose a file stores take over
 * a warning. Under DSP_ABSOLUTE_MIN_EDGE or not square stays blocked, because
 * no amount of resizing fixes those (lib/cover-art-dsp.ts).
 *
 * The output is always JPEG: DSPs take it, it keeps a 3000px file at a few MB
 * rather than the 10+ MB a PNG runs to, and it turns a WebP into a format
 * stores accept. A transparent PNG is flattened onto white first, since
 * canvas JPEG would otherwise paint the transparent pixels black.
 *
 * Like lib/downscale-image.ts this is client-side only: the server cannot
 * decode images (no native image dependency in this repo).
 */

import { DSP_ABSOLUTE_MIN_EDGE, DSP_MIN_EDGE } from './cover-art-dsp';
import type { ImageDimensions } from './cover-art-image';
import { renameForMimeType } from './downscale-image';

const OUTPUT_MIME_TYPE = 'image/jpeg';
const OUTPUT_QUALITY = 0.92;

/**
 * The size to enlarge to, or null when the file should go up as it is
 * (already big enough, not square, or too small to be usable). Pure, so the
 * rule is unit tested without a DOM.
 */
export function coverArtUpscaleTarget(dimensions: ImageDimensions | null): ImageDimensions | null {
  if (!dimensions) return null;
  const width = Math.round(dimensions.width);
  const height = Math.round(dimensions.height);
  if (!Number.isFinite(width) || width !== height) return null;
  if (width < DSP_ABSOLUTE_MIN_EDGE || width >= DSP_MIN_EDGE) return null;
  return { width: DSP_MIN_EDGE, height: DSP_MIN_EDGE };
}

/**
 * Enlarge `file` to `target`. Returns null when the browser cannot draw or
 * encode it; the caller then uploads the original rather than failing, since
 * the original was already good enough to pass the picker.
 */
export async function upscaleCoverArt(
  file: File,
  target: ImageDimensions
): Promise<{ file: File; dimensions: ImageDimensions } | null> {
  if (typeof document === 'undefined') return null;

  const source = await decode(file);
  if (!source) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(source.image, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), OUTPUT_MIME_TYPE, OUTPUT_QUALITY);
    });
    if (!blob) return null;

    // Trust the blob's own type, as lib/downscale-image.ts does: the name has
    // to follow the bytes.
    const encodedType = blob.type || OUTPUT_MIME_TYPE;
    return {
      file: new File([blob], renameForMimeType(file.name, encodedType), { type: encodedType }),
      dimensions: { width: target.width, height: target.height },
    };
  } catch {
    return null;
  } finally {
    source.release();
  }
}

type DecodedSource = { image: CanvasImageSource; release: () => void };

async function decode(file: File): Promise<DecodedSource | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap,
        release: () => {
          if (typeof bitmap.close === 'function') bitmap.close();
        },
      };
    } catch {
      // Fall through to the <img> path, as lib/cover-art-image.ts does.
    }
  }

  if (typeof URL?.createObjectURL !== 'function') return null;

  return new Promise<DecodedSource | null>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const release = () => URL.revokeObjectURL(objectUrl);

    image.onload = () => resolve({ image, release });
    image.onerror = () => {
      release();
      resolve(null);
    };
    image.src = objectUrl;
  });
}
