/**
 * Square crop geometry for the profile photo cropper (2026-10-11).
 *
 * Model: the image is scaled to COVER a square viewport of `view` px, times a
 * zoom of 1 or more, and moved by an offset (px, from centred). The offset is
 * clamped so the image always covers the viewport: no empty corners can ever
 * reach a saved photo. Pure, so the maths is tested without a DOM.
 */

export type CropState = { zoom: number; x: number; y: number };

export const MIN_CROP_ZOOM = 1;
export const MAX_CROP_ZOOM = 4;

/** Scale that maps natural image px to viewport px at this zoom. */
export function cropScale(width: number, height: number, view: number, zoom: number): number {
  return (view / Math.max(1, Math.min(width, height))) * Math.max(MIN_CROP_ZOOM, zoom);
}

/** Keep the image covering the viewport at this zoom. */
export function clampCrop(width: number, height: number, view: number, state: CropState): CropState {
  const zoom = Math.min(MAX_CROP_ZOOM, Math.max(MIN_CROP_ZOOM, state.zoom));
  const scale = cropScale(width, height, view, zoom);
  const maxX = Math.max(0, (width * scale - view) / 2);
  const maxY = Math.max(0, (height * scale - view) / 2);
  return {
    zoom,
    x: Math.min(maxX, Math.max(-maxX, state.x)),
    y: Math.min(maxY, Math.max(-maxY, state.y)),
  };
}

/** The square of the source image the viewport shows, in natural px. */
export function cropSourceRect(
  width: number,
  height: number,
  view: number,
  state: CropState
): { sx: number; sy: number; size: number } {
  const clamped = clampCrop(width, height, view, state);
  const scale = cropScale(width, height, view, clamped.zoom);
  const size = view / scale;
  const sx = width / 2 - (view / 2 + clamped.x) / scale;
  const sy = height / 2 - (view / 2 + clamped.y) / scale;
  return {
    sx: Math.min(width - size, Math.max(0, sx)),
    sy: Math.min(height - size, Math.max(0, sy)),
    size,
  };
}
