/**
 * Shrinking an avatar-shaped image in the browser before it is uploaded.
 *
 * WHY THIS EXISTS. The workspace logo and the curator profile photo validated
 * MIME type and byte size and nothing else, so a file could pass every check
 * and still be impossible to display: a real one (2026-08-27) was a 1.1 MB PNG
 * at 12500x12500 — 156 megapixels, ~596 MB once decoded to RGBA. Comfortably
 * under the 5 MiB ceiling, `image/png`, accepted, stored, and then never
 * painted by any browser, because every engine refuses to decode past a
 * megapixel/memory limit (iOS Safari's is around 16 MP).
 *
 * The sharp end of that failure is that it does NOT fire an `error` event on
 * the <img>. Both display sites carry an onError fallback, and neither one
 * engaged — the user got a permanently broken box with no message and nothing
 * to click, on a picture that had uploaded perfectly.
 *
 * So byte size is the wrong guard on its own: bytes and decoded pixels are
 * only loosely related, and a highly compressible logo (flat colour, large
 * transparent margins) is exactly the file that hides an enormous canvas
 * inside a small download.
 *
 * WHY DOWNSCALE RATHER THAN REFUSE. These two images are only ever shown small
 * — 96px in Settings, 56px and 40px on the identity card, and at most a 280px
 * cover-art fallback on a release card. The original serves no purpose there,
 * so shrinking it fixes the bug without ever telling the user their file was
 * wrong. It also cuts the transfer by an order of magnitude, which matters
 * disproportionately for this product's users (see the weak-connection
 * failures recorded in CLAUDE.md under "The front door is server-rendered").
 *
 * Deliberately NOT the cover-art treatment (lib/cover-art-dsp.ts), which
 * never shrinks the file: a distributor needs the 3000x3000 master the
 * manager commissioned. (Since 2026-10-28 cover art under 3000 is ENLARGED
 * to it instead, see lib/upscale-cover-art.ts.) A logo has no such contract.
 *
 * Client-side only, and that is a considered limit rather than an oversight:
 * measuring an image on the server needs a native image dependency this repo
 * does not carry, the same call cover art already made. Someone bypassing this
 * by driving the API directly only breaks the display of their own avatar.
 */

import { readImageDimensions } from './cover-art-image';

/**
 * Longest edge we keep. 1024 is well inside every engine's decode limit (1 MP,
 * ~4 MB decoded) while still being four times the largest slot either image
 * lands in, so it stays sharp on a 3x screen and as a release-card fallback.
 */
export const MAX_AVATAR_IMAGE_EDGE_PX = 1024;

export type PreparedImage = {
  file: File;
  width: number;
  height: number;
  /** False when the source already fitted and was passed through untouched. */
  resized: boolean;
};

/**
 * Target box for `width`x`height` inside `maxEdge`, preserving aspect ratio.
 * Never enlarges. Pure, so the geometry is unit tested without a DOM.
 */
export function fitWithinEdge(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };

  const scale = maxEdge / longest;
  // Floor, then clamp to 1: a very long thin image would otherwise round its
  // short edge to 0 and produce a canvas nothing can draw into.
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  };
}

/** What we re-encode to. WebP folds into PNG — canvas WebP support is uneven
 * and PNG preserves the alpha a transparent logo depends on. */
export function targetMimeType(sourceMimeType: string): 'image/jpeg' | 'image/png' {
  return sourceMimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
}

/**
 * Swap a filename's extension so it matches the bytes we actually encoded.
 * The name is shown back to the user and used to build the storage path, so a
 * re-encoded WebP should not keep claiming to be one. Pure; unit tested.
 */
export function renameForMimeType(fileName: string, mimeType: string): string {
  const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';
  const lastDot = fileName.lastIndexOf('.');
  // Leading-dot filenames (".logo") have no extension to replace.
  const stem = lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
  return `${stem}.${extension}`;
}

/**
 * Measure a picked image and, if it is bigger than `maxEdge`, hand back a
 * shrunk copy. Returns the original untouched when it already fits, so a
 * correctly-sized logo is never re-encoded and never loses quality.
 *
 * Returns null when the browser cannot decode the file at all — corrupt, an
 * unsupported codec, or so large that decoding it fails outright. Callers must
 * treat null as a refusal: uploading something we could not read is precisely
 * how the broken-box bug shipped.
 */
export async function prepareAvatarImage(
  file: File,
  maxEdge: number = MAX_AVATAR_IMAGE_EDGE_PX
): Promise<PreparedImage | null> {
  const source = await readImageDimensions(file);
  if (!source) return null;

  const target = fitWithinEdge(source.width, source.height, maxEdge);
  if (target.width === source.width && target.height === source.height) {
    return { file, width: source.width, height: source.height, resized: false };
  }

  const mimeType = targetMimeType(file.type);
  const blob = await drawToBlob(file, target, mimeType);
  if (!blob) return null;

  // Trust the blob's own type: a browser asked for a format it cannot encode
  // silently hands back PNG, and the name has to follow the bytes.
  const encodedType = blob.type || mimeType;
  const renamed = renameForMimeType(file.name, encodedType);

  return {
    file: new File([blob], renamed, { type: encodedType }),
    width: target.width,
    height: target.height,
    resized: true,
  };
}

async function drawToBlob(
  file: File,
  target: { width: number; height: number },
  mimeType: string
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const source = await decodeAt(file, target);
  if (!source) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(source.image, 0, 0, target.width, target.height);

    return await new Promise<Blob | null>((resolve) => {
      // 0.9 applies to JPEG only; PNG ignores it.
      canvas.toBlob((result) => resolve(result), mimeType, 0.9);
    });
  } catch {
    return null;
  } finally {
    source.release();
  }
}

type DecodedSource = { image: CanvasImageSource; release: () => void };

/**
 * Decode `file` ready to draw at `target`.
 *
 * `createImageBitmap` with resize options first, which lets engines that
 * support them (Chrome, Firefox) scale during decode and never allocate the
 * full-size bitmap — the difference between 4 MB and 596 MB on the file that
 * prompted this module. Safari ignores the options and decodes full size, so
 * the canvas draw below still does the scaling there; correct either way.
 */
async function decodeAt(
  file: File,
  target: { width: number; height: number }
): Promise<DecodedSource | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: 'high',
      });
      return {
        image: bitmap,
        release: () => {
          if (typeof bitmap.close === 'function') bitmap.close();
        },
      };
    } catch {
      // Fall through: some engines reject the resize options, or the format,
      // here while the renderer handles it fine.
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
