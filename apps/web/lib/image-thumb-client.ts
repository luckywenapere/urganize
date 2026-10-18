/**
 * Browser half of image thumbs (lib/image-thumb.ts has the why): make the
 * 384px square display copy of a picked cover or photo and PUT it to the
 * signed URL the upload-url route handed back next to the original's.
 *
 * BEST EFFORT, ALWAYS. A thumb is an optimisation: anything that goes wrong
 * here (a browser that cannot decode the file, no canvas, a slow network)
 * resolves to false and the upload carries on, and lists simply show the
 * original. Nothing in this module throws, and the whole step is time boxed
 * so it can never hold up the save it rides along with.
 */

import { THUMB_EDGE_PX } from './image-thumb';

/** Generous for a phone on a weak link; the thumb is ~15-40 KB. */
const THUMB_STEP_TIMEOUT_MS = 8000;

/** Centre square crop of `width`x`height`, scaled to at most `edge`. Pure. */
export function thumbGeometry(
  width: number,
  height: number,
  edge: number = THUMB_EDGE_PX
): { sx: number; sy: number; side: number; out: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const side = Math.min(width, height);
  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side,
    out: Math.max(1, Math.min(edge, Math.floor(side))),
  };
}

type Decoded = { image: CanvasImageSource; width: number; height: number; release: () => void };

async function decode(file: Blob): Promise<Decoded | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        image: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => {
          if (typeof bitmap.close === 'function') bitmap.close();
        },
      };
    } catch {
      // Fall through to an <img> decode.
    }
  }
  if (typeof URL?.createObjectURL !== 'function' || typeof Image === 'undefined') return null;
  return new Promise<Decoded | null>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const release = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => resolve({ image, width: image.naturalWidth, height: image.naturalHeight, release });
    image.onerror = () => {
      release();
      resolve(null);
    };
    image.src = objectUrl;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * The 384px square copy as WebP, or JPEG where the browser cannot encode WebP
 * (older Safari silently hands back PNG, which would be far bigger). Null
 * when the image cannot be read here.
 */
export async function makeThumbBlob(file: Blob, edge: number = THUMB_EDGE_PX): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const source = await decode(file).catch(() => null);
  if (!source) return null;
  try {
    const geometry = thumbGeometry(source.width, source.height, edge);
    if (!geometry) return null;
    const draw = (background: string | null): HTMLCanvasElement | null => {
      const canvas = document.createElement('canvas');
      canvas.width = geometry.out;
      canvas.height = geometry.out;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      if (background) {
        // JPEG has no alpha: paint the app surface under a transparent PNG
        // instead of letting it turn black.
        context.fillStyle = background;
        context.fillRect(0, 0, geometry.out, geometry.out);
      }
      context.drawImage(
        source.image,
        geometry.sx,
        geometry.sy,
        geometry.side,
        geometry.side,
        0,
        0,
        geometry.out,
        geometry.out
      );
      return canvas;
    };

    const webpCanvas = draw(null);
    if (!webpCanvas) return null;
    const webp = await toBlob(webpCanvas, 'image/webp', 0.8);
    if (webp && webp.type === 'image/webp') return webp;

    const jpegCanvas = draw('#171719');
    if (!jpegCanvas) return null;
    const jpeg = await toBlob(jpegCanvas, 'image/jpeg', 0.82);
    return jpeg && jpeg.type === 'image/jpeg' ? jpeg : null;
  } catch {
    return null;
  } finally {
    source.release();
  }
}

/**
 * Make the thumb of `file` and PUT it to `uploadUrl`. Resolves true when it
 * landed; false for every other outcome (no URL, could not encode, upload
 * failed, took too long). Never rejects.
 */
export async function uploadThumb(
  uploadUrl: string | null | undefined,
  file: Blob,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!uploadUrl) return false;
  const work = (async () => {
    try {
      const thumb = await makeThumbBlob(file);
      if (!thumb) return false;
      const response = await fetchImpl(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': thumb.type },
        body: thumb,
      });
      return response.ok;
    } catch {
      return false;
    }
  })();
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), THUMB_STEP_TIMEOUT_MS));
  return Promise.race([work, timeout]);
}
