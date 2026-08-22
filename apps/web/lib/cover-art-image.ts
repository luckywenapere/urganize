/**
 * Measuring an image file in the browser.
 *
 * Split out from `lib/cover-art-dsp.ts` on purpose: that module is pure and
 * unit tested, this one touches `createImageBitmap`, `Image` and object URLs,
 * none of which exist in the vitest environment. Keeping them apart is what
 * lets the rules be tested without a DOM.
 *
 * This is the first image decoding anywhere in this codebase — nothing here
 * has ever needed pixel dimensions before (see the comments in
 * lib/capture-playbook/index.ts, which note that `assets` stores none).
 */

export type ImageDimensions = { width: number; height: number };

/**
 * Read a picked file's pixel dimensions, or null if we cannot.
 *
 * NEVER throws: every caller treats null as "unreadable" and surfaces that as
 * a blocked upload, which is the honest answer whether the file is corrupt,
 * the codec is unsupported, or the API is missing.
 *
 * `createImageBitmap` first (it decodes off the main thread and needs no DOM
 * node), falling back to an `<img>` + object URL for older WebKit. The object
 * URL is revoked on both paths, including the failure path.
 */
export async function readImageDimensions(file: Blob): Promise<ImageDimensions | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      // Free the decoded pixels straight away; a 3000x3000 bitmap is ~36MB.
      if (typeof bitmap.close === 'function') bitmap.close();
      if (dimensions.width > 0 && dimensions.height > 0) return dimensions;
    } catch {
      // Fall through to the <img> path rather than giving up: some browsers
      // refuse a format here that the renderer itself handles fine.
    }
  }

  return readViaImageElement(file);
}

function readViaImageElement(file: Blob): Promise<ImageDimensions | null> {
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const finish = (result: ImageDimensions | null) => {
      URL.revokeObjectURL(objectUrl);
      resolve(result);
    };

    image.onload = () => {
      const { naturalWidth: width, naturalHeight: height } = image;
      finish(width > 0 && height > 0 ? { width, height } : null);
    };
    image.onerror = () => finish(null);
    image.src = objectUrl;
  });
}
